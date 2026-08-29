/**
 * Shared ownership of the connections to one person's own machines.
 *
 * The substrate is OpenSSH itself — the `ssh` client already on the machine —
 * not a protocol library. Everything a connection needs is already written in
 * `~/.ssh/config`: jump hosts, identity files, agent forwarding, known-host
 * policy, per-host `Match` rules. A second implementation would have to agree
 * with that file forever, and would diverge from it at the first OpenSSH
 * release; shelling out cannot diverge, because it IS the client.
 *
 * The service owns three things the adapters share: which aliases exist, what
 * an alias resolves to, and one multiplexed connection per alias so a second
 * command does not pay for a second handshake.
 *
 * @module @unieai/uad-ssh
 */

import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { dshHomePath } from '@unieai/uad-home-paths'
import { scrubbedParentEnv } from '@unieai/uad-subprocess'
import { readHostEntries } from './config-file.ts'
import type { SshHostEntry } from './config-file.ts'
import { addHost, removeHost } from './edit.ts'
import type { SshEditRefusal, SshHostDraft } from './edit.ts'
import { parseEffectiveConfig, resolvedHostOf } from './resolve.ts'
import type { ResolvedSshHost } from './resolve.ts'

export { includePaths, readHostEntries, splitDirective } from './config-file.ts'
export type { SshHostEntry } from './config-file.ts'
export { parseEffectiveConfig, resolvedHostOf } from './resolve.ts'
export type { ResolvedSshHost } from './resolve.ts'
export { addHost, blockSpan, hostBlock, removeHost } from './edit.ts'
export type { SshEditRefusal, SshHostDraft } from './edit.ts'

declare module '@unieai/cordis' {
  interface Context {
    ssh: SshHosts
  }
}

/** Configuration for the machine book. */
export interface Config {
  /**
   * OpenSSH configuration file this book reads and connects with.
   *
   * Omitted, the client uses its own defaults — `~/.ssh/config` plus the
   * system file — which is what makes a machine reachable here exactly when
   * it is reachable from the person's terminal. Naming a file steers BOTH
   * the alias list and every connection, so the two can never disagree.
   */
  configPath?: string
  /** The `ssh` client to run; a bare name is resolved on the harness PATH. */
  sshCommand?: string
  /** Seconds a connection attempt may take before OpenSSH gives up. */
  connectTimeoutSeconds?: number
  /**
   * Seconds an idle multiplexed connection is kept open.
   *
   * This is what makes remote work usable: the first command performs the
   * handshake, and every command within the window reuses it. Zero disables
   * multiplexing, which is the honest setting for a host whose configuration
   * forbids it.
   */
  controlPersistSeconds?: number
}

/** Schema for the machine book. */
export const Config: z<Config> = z.object({
  configPath: z.string(),
  sshCommand: z.string().default('ssh'),
  connectTimeoutSeconds: z.natural().default(10),
  controlPersistSeconds: z.natural().default(600),
})

/**
 * Longest control path OpenSSH will bind, with margin.
 *
 * The real limit is the platform's `sun_path` — 104 bytes on macOS, 108 on
 * Linux — and OpenSSH fails the whole connection, not just multiplexing,
 * when the path exceeds it. A deep harness home must therefore cost
 * multiplexing rather than the machine.
 */
const CONTROL_PATH_LIMIT = 100

/**
 * Characters `%C` becomes: OpenSSH substitutes a 40-character hex digest of
 * the connection, so the template is 38 characters shorter than what is
 * actually bound and cannot be measured directly.
 */
const CONTROL_TOKEN_LENGTH = 40

/**
 * Quote one argument for a POSIX shell.
 *
 * The remote end of `ssh host <command>` is a shell, always: OpenSSH joins
 * its arguments with spaces and hands the string to the login shell. Every
 * argument therefore crosses one shell layer that the caller never asked
 * for, and single-quoting is what keeps an argument the value it was.
 * @param value - the exact argument value to preserve.
 * @returns one shell word that expands to nothing else.
 */
export function quoteShellArg(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}

/**
 * Compose the remote command line for one fully specified spawn.
 *
 * Three details are load-bearing, each learned from a real remote shell:
 *
 * `exec` keeps the command from running under a wrapper process the caller
 * never asked for — a signal delivered to the connection would otherwise
 * reach the wrapper and leave the command running.
 *
 * Environment entries are an ASSIGNMENT PREFIX rather than `env A=b -- cmd`.
 * POSIX `env` accepts `--` only before the assignments, so the `--` form
 * fails outright on a system whose `env` follows the standard, reporting
 * `'--': No such file or directory`.
 *
 * There is no `--` before the command either: `exec --` is a bash extension
 * that dash rejects with `exec: --: not found`, and the remote end is the
 * person's login shell, not a shell we chose. What `--` would have protected
 * against is instead refused up front.
 *
 * @param argv - the command and its arguments, quoted here. A command name
 * starting with `-` is refused rather than sent, because no portable way to
 * mark the end of options exists on the remote shell.
 * @param cwd - remote directory to run in; a missing one fails the command rather than running it somewhere else.
 * @param env - environment entries to set for the command.
 * @returns one command string for the remote login shell.
 * @throws when argv is empty or its command name begins with `-`.
 */
export function remoteCommandLine(
  argv: readonly string[],
  cwd: string | undefined,
  env: Readonly<Record<string, string>> = {},
): string {
  const command = argv[0]
  if (command === undefined) throw new Error('ssh: a remote command needs at least an executable')
  if (command.startsWith('-')) {
    throw new Error(`ssh: refusing to run '${command}': a remote command name cannot begin with '-'`)
  }
  const assignments = Object.entries(env).map(([key, value]) => `${key}=${quoteShellArg(value)}`)
  const line = [...assignments, 'exec', ...argv.map(quoteShellArg)].join(' ')
  // `cd` failure must not fall through to running the command in the login
  // directory: a caller that named a directory meant it.
  const prefix = cwd === undefined ? '' : `cd ${quoteShellArg(cwd)} || exit 127; `
  return `${prefix}${line}`
}

/**
 * The home directory OpenSSH expands `~` against.
 *
 * OpenSSH reads it from the password database and ignores `HOME`, so a process
 * launched with a different `HOME` — a container, `sudo`, some desktop
 * launchers — makes `os.homedir()` name a file the client will never open. The
 * book would then list aliases that cannot be connected to, and the connection
 * fails with a DNS error naming the alias, because to the client the alias was
 * only ever a hostname.
 * @returns the password-database home, falling back to `os.homedir()` where
 *   the running uid has no entry.
 */
function sshUserHome(): string {
  try {
    return userInfo().homedir
  } catch {
    // No passwd entry for this uid (some container images): nothing better
    // than the environment is available, and OpenSSH itself fails the same way.
    return homedir()
  }
}

/**
 * The machine book: which machines exist, what they resolve to, and the
 * connection every adapter shares.
 */
export class SshHosts extends Service {
  /** Aliases whose multiplexed connection this service may have opened. */
  private readonly opened = new Set<string>()

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'ssh')
    ctx.effect(() => () => { void this.closeAll() }, 'ssh: multiplexed connections')
  }

  /** OpenSSH configuration file this book reads. */
  get configPath(): string {
    return this.config.configPath ?? join(sshUserHome(), '.ssh', 'config')
  }

  /** Directory holding the multiplexing sockets. */
  get controlDir(): string {
    return dshHomePath('ssh')
  }

  /**
   * Every alias a person could pick, in configuration-file order.
   *
   * Unmemoized: a machine added to the file while Rabi runs is selectable
   * immediately, and one deleted disappears from the next read.
   * @returns the aliases, empty when the file does not exist yet.
   */
  list(): Promise<SshHostEntry[]> {
    return readHostEntries(this.configPath)
  }

  /**
   * What one alias resolves to, according to the client that will connect.
   * @param alias - the alias to resolve.
   * @param signal - aborts the resolution.
   * @returns the effective settings.
   */
  async resolve(alias: string, signal?: AbortSignal): Promise<ResolvedSshHost> {
    const { stdout } = await this.runSsh(['-G', alias], signal)
    return resolvedHostOf(alias, parseEffectiveConfig(stdout))
  }

  /**
   * The multiplexing socket path for this deployment, or undefined when the
   * harness home is too deep for a bindable socket.
   * @returns the `ControlPath` value, `%C` included, or undefined.
   */
  controlPath(): string | undefined {
    if ((this.config.controlPersistSeconds ?? 600) === 0) return undefined
    const path = join(this.controlDir, '%C')
    const bound = path.length - '%C'.length + CONTROL_TOKEN_LENGTH
    return bound > CONTROL_PATH_LIMIT ? undefined : path
  }

  /**
   * The `ssh` argv for one remote command.
   *
   * Multiplexing is requested rather than assumed: `ControlMaster=auto` opens
   * a master when there is none and joins one when there is, so the first
   * command pays the handshake and the rest do not.
   * @param alias - the machine to run on.
   * @param remoteCommand - the command line for the remote shell; omitted for a login session.
   * @param options - `tty` allocates a remote terminal, which is also what makes the remote command die with the connection.
   * @returns argv whose first element is the configured `ssh` client.
   */
  argvFor(
    alias: string,
    remoteCommand?: string,
    options: { tty?: boolean } = {},
  ): string[] {
    const argv = [this.config.sshCommand ?? 'ssh']
    // A configured file has to reach the connection too, or the book would
    // list machines from one place and connect using another.
    if (this.config.configPath !== undefined) argv.push('-F', this.config.configPath)
    const control = this.controlPath()
    if (control !== undefined) {
      argv.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${control}`)
      argv.push('-o', `ControlPersist=${String(this.config.controlPersistSeconds ?? 600)}`)
    }
    argv.push('-o', `ConnectTimeout=${String(this.config.connectTimeoutSeconds ?? 10)}`)
    // NOTHING MAY PROMPT ON A TERMINAL NOBODY IS LOOKING AT. Without
    // `BatchMode`, a machine that wants a password or a key passphrase makes
    // the client ask for it on whatever stdio this process inherited — which
    // for an app launched from a dock is nowhere, and for one launched from a
    // shell is a terminal the person was not working in. Either way the
    // command stops until something types, and the surface that asked for it
    // shows nothing.
    //
    // Batch mode turns that into OpenSSH's own refusal, which a surface can
    // show and a person can act on (`ssh-add` their key). The exception is a
    // real terminal session: the person IS looking at that one, and a
    // passphrase prompt there is the connection working.
    if (options.tty !== true) argv.push('-o', 'BatchMode=yes')
    // A terminal is allocated only where one is wanted: with `-tt` the remote
    // end translates newlines and folds stderr into stdout, which would
    // corrupt collected output.
    argv.push(options.tty === true ? '-tt' : '-T')
    argv.push(alias)
    if (remoteCommand !== undefined) argv.push('--', remoteCommand)
    return argv
  }

  /**
   * Write one machine into the person's configuration.
   *
   * Append-only: whatever the file already says is unchanged, and the new
   * block goes at the end where a person will find it. Editing an existing
   * machine is deliberately not offered — a form that parsed the file into
   * fields and wrote it back would lose the comments and the order on the
   * first save, and nothing would tell them until they looked.
   * @param draft - the machine to add.
   * @returns nothing, or the refusal that stopped it.
   */
  add(draft: SshHostDraft): Promise<SshEditRefusal | undefined> {
    return addHost(this.configPath, draft)
  }

  /**
   * Remove one machine from the person's configuration.
   *
   * Only a block that file declares alone: an alias sharing a `Host` line,
   * or one that came from an included file, is refused with which it was,
   * because either edit changes a line another machine depends on.
   * @param alias - the machine to remove.
   * @param declaredIn - the file the alias was read from, when known.
   * @returns nothing, or the refusal that stopped it.
   */
  async remove(alias: string, declaredIn?: string): Promise<SshEditRefusal | undefined> {
    const refusal = await removeHost(this.configPath, alias, declaredIn)
    // A removed machine may still have a connection open; leaving it would
    // keep a socket to a machine the person just said they were done with.
    if (refusal === undefined) await this.disconnect(alias)
    return refusal
  }

  /**
   * Try one connection and report what OpenSSH said.
   *
   * `BatchMode` is what makes this answerable: without it a machine needing a
   * passphrase would wait for a prompt nobody is watching, and the probe
   * would hang instead of reporting that the key is locked.
   * @param alias - the machine to reach.
   * @param signal - aborts the attempt.
   * @returns reachability, with the client's own message when it failed.
   */
  async probe(alias: string, signal?: AbortSignal): Promise<{ reachable: boolean; message: string }> {
    await this.ensureControlDir()
    const argv = [...this.argvFor(alias, 'exit 0').slice(1)]
    argv.splice(0, 0, '-o', 'BatchMode=yes')
    try {
      await this.runSsh(argv, signal)
      this.opened.add(alias)
      return { reachable: true, message: '' }
    } catch (error) {
      return { reachable: false, message: messageOf(error) }
    }
  }

  /** Create the socket directory before OpenSSH needs to bind in it. */
  async ensureControlDir(): Promise<void> {
    if (this.controlPath() === undefined) return
    await mkdir(this.controlDir, { recursive: true, mode: 0o700 })
  }

  /**
   * Record that an alias now has a multiplexed connection this service owns.
   * @param alias - the machine just connected to.
   */
  noteConnected(alias: string): void {
    this.opened.add(alias)
  }

  /**
   * Close one alias's multiplexed connection.
   *
   * A master that is already gone is not an error: `ControlPersist` may have
   * expired, and the caller's intent — no connection to this machine — holds
   * either way.
   * @param alias - the machine to disconnect from.
   */
  async disconnect(alias: string): Promise<void> {
    this.opened.delete(alias)
    if (this.controlPath() === undefined) return
    try {
      await this.runSsh([...this.argvFor(alias).slice(1, -1), '-O', 'exit', alias])
    } catch {
      // Reported by the next connection attempt, which is the only place a
      // stale socket can still matter.
    }
  }

  /** Close every connection this service opened. */
  private async closeAll(): Promise<void> {
    await Promise.all([...this.opened].map(alias => this.disconnect(alias)))
  }

  /**
   * Run the `ssh` client for one of this service's own control commands.
   *
   * These are the small fixed commands the book itself needs — resolution,
   * probing, disconnecting — so they run through Node directly rather than
   * through `ctx.subprocess`: the subprocess provider on a remote deployment
   * IS an ssh adapter, and asking it to resolve an alias would be circular.
   * @param argv - arguments after the client name.
   * @param signal - aborts the run.
   * @returns the client's stdout.
   */
  private runSsh(argv: readonly string[], signal?: AbortSignal): Promise<{ stdout: string }> {
    const command = this.config.sshCommand ?? 'ssh'
    const configured = this.config.configPath === undefined ? [] : ['-F', this.config.configPath]
    return new Promise((resolve, reject) => {
      execFile(command, [...configured, ...argv], {
        env: scrubbedParentEnv(),
        signal,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(stderr.trim() === '' ? messageOf(error) : stderr.trim(), { cause: error }))
          return
        }
        resolve({ stdout })
      })
    })
  }
}

/**
 * The message of an unknown thrown value.
 * @param error - the caught value.
 * @returns its message, or its string form when it is not an Error.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default SshHosts
