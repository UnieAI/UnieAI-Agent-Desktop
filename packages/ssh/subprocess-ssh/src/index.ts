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

  constructor(ctx: Context, public sshConfig: Config) {
    super(ctx)
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
      argv: this.ctx.ssh.argvFor(this.sshConfig.machine, line),
      cwd: homedir(),
      env: CLIENT_ENV,
    })
    // The pid file is the only trace a run leaves on the machine, so its
    // removal is tied to the outcome rather than to a successful exit.
    void handle.done.then(
      () => { this.control(cleanupLine(pidFile)) },
      () => { this.control(cleanupLine(pidFile)) },
    )
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
    const found = (await this.control(withPath(lookup, env), signal)).trim()
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
      argv: this.ctx.ssh.argvFor(this.sshConfig.machine, line, { tty: true }),
      cwd: homedir(),
      env: {},
    })
    void local.done.finally(() => {
      this.control(`${cleanupLine(pidFile)}; ${cleanupLine(ttyFile)}`)
    })
    return new RemoteTerminalHandle(
      local,
      line => this.control(line),
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
   * @returns the command's stdout.
   */
  private async control(line: string, signal?: AbortSignal): Promise<string> {
    const handle = super.spawn({
      argv: this.ctx.ssh.argvFor(this.sshConfig.machine, line),
      cwd: homedir(),
      env: CLIENT_ENV,
      stdio: { stdin: 'ignore', stdout: CONTROL_OUTPUT, stderr: CONTROL_OUTPUT },
      graceMs: CONTROL_GRACE_MS,
      ...(signal === undefined ? {} : { signal }),
    })
    await handle.done
    return handle.collected.stdout?.readFrom(0).text ?? ''
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
    return {
      get pid() { return handle.pid },
      get stdin() { return handle.stdin },
      get stdout() { return handle.stdout },
      get stderr() { return handle.stderr },
      get collected() { return handle.collected },
      done: handle.done,
      terminate: () => {
        handle.terminate()
        if (ending) return
        ending = true
        void this.endRemote(pidFile, graceMs)
      },
      waitForExit: signal => handle.waitForExit(signal),
    }
  }

  /**
   * Signal the remote process group, then escalate once.
   *
   * The wait is the caller's own grace, so a consumer that allows a slow
   * shutdown gets one on the remote too. A KILL always follows: the run's
   * pid file is removed by the outcome handler either way, and a process
   * that ignored TERM would otherwise keep the machine's work alive with
   * nothing left to observe it.
   * @param pidFile - shell expression naming the run's pid file.
   * @param graceMs - milliseconds between TERM and KILL.
   */
  private async endRemote(pidFile: string, graceMs: number): Promise<void> {
    try {
      await this.control(terminationLine(pidFile, 'TERM'))
      await sleepMs(graceMs)
      await this.control(terminationLine(pidFile, 'KILL'))
    } catch {
      // The connection is gone, which is also how a caller's command ends;
      // nothing here can report to anyone still waiting.
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
