/**
 * The subprocess seam, placed on a machine reached over SSH.
 *
 * Every command the harness runs — the Bash tool's executor, a language
 * server, a search — goes through `ctx.subprocess`, so replacing this one
 * service moves all of them to the remote machine without any of them
 * knowing. That is the [portable execution-world
 * decision](../../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md)
 * being paid off.
 *
 * The implementation is a REWRITE, not a reimplementation: it extends the
 * local provider and turns each spec into an `ssh` invocation of the same
 * command. Everything below the rewrite — detached process trees, collect
 * mode with its offset readers and spill files, the SIGTERM-grace-SIGKILL
 * escalation, disposal, host-exit finalization — is the local provider's,
 * already written and already tested, and here it manages the `ssh` client
 * process that stands in for the remote command.
 *
 * @module @unieai/uad-subprocess-ssh
 */

import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { setTimeout as sleepMs } from 'node:timers/promises'
import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { LocalSubprocessRuntime } from '@unieai/uad-subprocess-local'
import { quoteShellArg, remoteCommandLine } from '@unieai/uad-ssh'
import type { SshHosts } from '@unieai/uad-ssh'
import type {
  SubprocessHandle,
  SubprocessSpawnSpec,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@unieai/uad-subprocess'
import { cleanupLine, pidFileExpression, recordingPid, terminationLine } from './remote-process.ts'
import { RemoteTerminalHandle, recordingSession, ttyFileExpression } from './terminal.ts'

export { cleanupLine, pidFileExpression, recordingPid, terminationLine } from './remote-process.ts'
export type { RemoteRun } from './remote-process.ts'
export {
  RemoteTerminalHandle,
  foregroundGroupCommand,
  groupMembersCommand,
  sessionTerminationLine,
  inputWaitingCommand,
  recordingSession,
  ttyFileExpression,
} from './terminal.ts'
export type { RemoteControl } from './terminal.ts'

/** Configuration for the remote subprocess provider. */
export interface Config {
  /** Alias of the machine every command runs on, as the person's OpenSSH configuration names it. */
  machine: string
}

/** Schema for the remote subprocess provider. */
export const Config: z<Config> = z.object({
  machine: z.string().required(),
})

/**
 * Local environment for the `ssh` client itself.
 *
 * Empty on purpose: the spec's environment belongs to the REMOTE command and
 * travels inside the command line. What the client needs — `HOME`, `PATH`,
 * and `SSH_AUTH_SOCK` for agent authentication — comes from the local
 * provider's own scrubbed parent environment, which keeps those and drops
 * credential-shaped names.
 */
const CLIENT_ENV: NodeJS.ProcessEnv = {}

/** Small collected stream for this provider's own control commands. */
const CONTROL_OUTPUT = { maxBytes: 64 * 1024 } as const

/** Grace for a control command that should answer immediately. */
const CONTROL_GRACE_MS = 5_000

/**
 * Subprocess provider whose execution world is a remote machine.
 *
 * Mounted in place of the local provider, never beside it: one service
 * implementation per context, and the mounted filesystem provider must
 * describe the same machine.
 */
export class SshSubprocessRuntime extends LocalSubprocessRuntime {
  /** The machine book supplies the connection arguments. */
  static inject = ['ssh']

  /** Config schema, reachable from a composition that constructs directly. */
  static Config: z<Config> = Config

  /**
   * @param ctx - context this provider registers `subprocess` in.
   * @param sshConfig - which machine every command runs on.
   * @param hosts - the machine book, for a caller that constructs this
   * directly. Mounted as a plugin the declared injection supplies it; built
   * by hand — as the execution router does — nothing declares it, and
   * reading an undeclared service through the context proxy is refused.
   */
  constructor(ctx: Context, public sshConfig: Config, private readonly hosts?: SshHosts) {
    super(ctx)
  }

  /** The machine book: the one handed in, else the declared injection. */
  private get book(): SshHosts {
    return this.hosts ?? this.ctx.ssh
  }

  /**
   * Turn one local-shaped spec into an `ssh` invocation of the same command.
   *
   * The client's own working directory is the harness user's home rather
   * than the spec's: the spec names a directory on the REMOTE machine, and
   * handing it to a local spawn would fail for every path that does not
   * happen to exist on both.
   * @param spec - the caller's fully specified spawn.
   * @returns the handle, whose termination also ends the remote process group.
   */
  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const pidFile = pidFileExpression(randomUUID())
    const line = recordingPid(remoteCommandLine(spec.argv, spec.cwd, remoteEnv(spec.env)), pidFile)
    const handle = super.spawn({
      ...spec,
      argv: this.book.argvFor(this.sshConfig.machine, line),
      cwd: homedir(),
      env: CLIENT_ENV,
    })
    return this.terminatingRemotely(handle, pidFile, spec.graceMs)
  }

  /**
   * Resolve one executable on the remote machine.
   *
   * `command -v` is the POSIX answer and is a shell builtin, so it costs no
   * remote process beyond the shell that is already starting. An absolute
   * path is verified rather than trusted, because the whole point of asking
   * is to fail before a spawn does.
   * @param command - absolute executable path or bare PATH name.
   * @param env - explicit environment entries used for lookup.
   * @param signal - aborts the lookup.
   * @returns the executable path on the remote machine.
   */
  override async resolveExecutable(
    command: string,
    env?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<string> {
    if (command === '') throw new Error('subprocess-ssh: an executable name cannot be empty')
    if (!command.startsWith('/') && (command.includes('/') || command.includes('\\'))) {
      // Same refusal as the local provider: the base a relative path would
      // resolve against is undefined, so guessing one is worse than failing.
      throw new Error(`subprocess-ssh: relative executable path '${command}' has no resolution base`)
    }
    const lookup = command.startsWith('/')
      ? `test -x ${quoteShellArg(command)} && printf %s ${quoteShellArg(command)}`
      : `command -v ${quoteShellArg(command)}`
    const found = (await this.control(withPath(lookup, env), signal)).text.trim()
    if (found === '') {
      throw new Error(`subprocess-ssh: '${command}' is not an executable on ${this.sshConfig.machine}`)
    }
    return found
  }

  /**
   * Allocate a terminal on the machine.
   *
   * The local half is an ordinary PTY running `ssh -tt`, which carries the
   * bytes, the window size and the session's lifetime. A terminal is what
   * makes `-tt` correct here — the tty translation and merged streams that
   * would corrupt a collected command are exactly what a terminal wants.
   *
   * Every question ABOUT the session is answered on the machine instead,
   * because the local PTY's foreground process is always `ssh`: see
   * {@link RemoteTerminalHandle}.
   * @param spec - the fully specified terminal to allocate.
   * @returns the live handle after allocation succeeds.
   */
  override async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    const id = randomUUID()
    const pidFile = pidFileExpression(id)
    const ttyFile = ttyFileExpression(id)
    const line = recordingSession(
      remoteCommandLine(spec.argv, spec.cwd, spec.env ?? {}),
      pidFile,
      ttyFile,
    )
    const local = await super.spawnTerminal({
      ...spec,
      argv: this.book.argvFor(this.sshConfig.machine, line, { tty: true }),
      cwd: homedir(),
      env: {},
    })
    void local.done.finally(() => {
      void this.control(`${cleanupLine(pidFile)}; ${cleanupLine(ttyFile)}`)
    })
    return new RemoteTerminalHandle(
      local,
      async line => (await this.control(line)).text,
      pidFile,
      ttyFile,
      spec.graceMs,
    )
  }

  /**
   * Run one short command on the machine and collect its stdout.
   *
   * These are this provider's own control commands — an executable lookup, a
   * signal, a cleanup — never a caller's work, so they take a fixed small
   * collection cap and a short grace.
   * @param line - the remote command line.
   * @param signal - aborts the run.
   * @returns the command's stdout and its exit status.
   */
  private async control(line: string, signal?: AbortSignal): Promise<{ text: string; exitCode: number | null }> {
    const handle = super.spawn({
      argv: this.book.argvFor(this.sshConfig.machine, line),
      cwd: homedir(),
      env: CLIENT_ENV,
      stdio: { stdin: 'ignore', stdout: CONTROL_OUTPUT, stderr: CONTROL_OUTPUT },
      graceMs: CONTROL_GRACE_MS,
      ...(signal === undefined ? {} : { signal }),
    })
    const outcome = await handle.done
    return { text: handle.collected.stdout?.readFrom(0).text ?? '', exitCode: outcome.exitCode }
  }

  /**
   * Extend one handle's termination to the remote process group.
   *
   * Both halves are needed and neither is enough: ending the client releases
   * the caller's streams and settles the outcome, while the remote signal is
   * what actually stops the work — a remote process survives the connection
   * closing, including one that ignores SIGHUP.
   * @param handle - the client process handle.
   * @param pidFile - shell expression naming the run's pid file.
   * @param graceMs - the caller's TERM-to-KILL grace, reused for the remote escalation.
   * @returns a handle that terminates both ends.
   */
  private terminatingRemotely(
    handle: SubprocessHandle,
    pidFile: string,
    graceMs: number,
  ): SubprocessHandle {
    let ending = false
    const end = (): void => {
      if (ending) return
      ending = true
      void this.endRemote(pidFile, graceMs)
    }
    // What the client's exit means for the machine depends on WHOSE exit it
    // was. A status the remote command produced (anything but 255) means the
    // command finished, and its pid file is just litter. A 255, or a signal,
    // is the CLIENT ending — which says nothing about the remote process,
    // since outliving its connection is exactly what a remote process does.
    // Removing the pid file then would throw away the only handle on work
    // that is still running.
    void handle.done.then(
      (outcome) => {
        if (outcome.exitCode === 255 || outcome.signal !== null) end()
        else void this.control(cleanupLine(pidFile))
      },
      () => { end() },
    )
    return {
      get pid() { return handle.pid },
      get stdin() { return handle.stdin },
      get stdout() { return handle.stdout },
      get stderr() { return handle.stderr },
      get collected() { return handle.collected },
      done: handle.done,
      terminate: () => {
        // The remote end is started BEFORE the client is killed: killing it
        // first would settle `done`, and the handler above would have to
        // decide the same thing from less information.
        end()
        handle.terminate()
      },
      waitForExit: signal => handle.waitForExit(signal),
    }
  }

  /**
   * Signal the remote process group, then escalate once.
   *
   * The wait is the caller's own grace, so a consumer that allows a slow
   * shutdown gets one on the remote too. A KILL always follows: a process
   * that ignored TERM would otherwise keep the machine's work alive with
   * nothing left to observe it.
   * @param pidFile - shell expression naming the run's pid file.
   * @param graceMs - milliseconds between TERM and KILL.
   */
  private async endRemote(pidFile: string, graceMs: number): Promise<void> {
    await this.signalRemote(pidFile, 'TERM')
    await sleepMs(graceMs)
    await this.signalRemote(pidFile, 'KILL')
    await this.signalRemote(pidFile, 'CLEANUP')
  }

  /**
   * Deliver one termination step, retrying a lost connection once.
   *
   * A failed control command is NOT evidence that the work stopped — the
   * whole reason this machinery exists is that a remote process outlives its
   * connection. The multiplexed master can also be closed by anything else
   * holding it, so the first failure is usually "that socket is gone", and
   * the retry opens a fresh connection.
   * @param pidFile - shell expression naming the run's pid file.
   * @param step - which command to send.
   */
  private async signalRemote(pidFile: string, step: 'TERM' | 'KILL' | 'CLEANUP'): Promise<void> {
    const line = step === 'CLEANUP' ? cleanupLine(pidFile) : terminationLine(pidFile, step)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // The exit status is the point: the remote script always ends `exit
        // 0`, so anything else came from the CLIENT — a master closed
        // underneath it, a refused connection — and treating that as done
        // would leave the machine running work nobody is watching.
        if ((await this.control(line)).exitCode === 0) return
      } catch {
        // Same conclusion as a non-zero status; the retry is the answer.
      }
    }
  }
}

/**
 * The environment entries a remote command receives.
 *
 * A `undefined` value is the seam's tombstone — remove an ambient entry —
 * which has no assignment form, so those names are dropped here and unset by
 * the composed command line instead.
 * @param env - the spec's environment.
 * @returns entries with values, ready to become assignments.
 */
function remoteEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value !== undefined) entries[key] = value
  }
  return entries
}

/**
 * Apply the lookup environment to a control command.
 *
 * Only `PATH` matters for `command -v`, and it is applied as an assignment
 * prefix for the same reason the spawn path does: `env A=b -- cmd` is not
 * portable.
 * @param line - the lookup command line.
 * @param env - explicit environment entries.
 * @returns the line, with PATH applied when the caller supplied one.
 */
function withPath(line: string, env?: Readonly<Record<string, string>>): string {
  const path = env?.['PATH']
  return path === undefined ? line : `PATH=${quoteShellArg(path)}; export PATH; ${line}`
}

export default SshSubprocessRuntime
