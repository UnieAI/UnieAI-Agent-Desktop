/**
 * A real OpenSSH server, started for one test run and thrown away.
 *
 * WHY THIS EXISTS. The suites that prove remote machines work used to be
 * `describe.skipIf(!ready)`, gated on two environment variables naming a server
 * someone had set up by hand. In every ordinary run — including CI — they
 * skipped, silently, and the remote path shipped with no coverage at all. Three
 * defects reached a person that way: a provider constructed without its machine
 * book, a client left free to ask for a password on whatever terminal it
 * inherited, and a configuration file resolved from `HOME` when OpenSSH reads
 * the password database. Every one of them is the kind a real connection
 * catches on the first command.
 *
 * So the server is started BY the test. Loopback only, on a port the OS picks,
 * with a host key and a client key generated per run and deleted after; it
 * authenticates by key and refuses passwords, so nothing can hang waiting for
 * a human. What it proves is what a mock cannot: that the argv this repository
 * builds is one the real client accepts, and that the command arrives.
 *
 * @module @unieai/uad-ssh-server
 */

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile, chmod } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'

const run = promisify(execFile)

/** Where the `sshd` and `ssh-keygen` binaries are looked for, in order. */
const SSHD_CANDIDATES = ['/usr/sbin/sshd', '/usr/local/sbin/sshd', '/opt/homebrew/sbin/sshd'] as const

/** One disposable server, and how to reach it. */
export interface DisposableSshd {
  /** The alias a test connects to; resolves through {@link configPath}. */
  readonly alias: string
  /** An OpenSSH client configuration naming that alias. */
  readonly configPath: string
  /** The loopback port it listens on. */
  readonly port: number
  /** Stop it and remove everything it wrote. */
  stop(): Promise<void>
}

/**
 * Whether this machine can run one.
 *
 * A missing `sshd` is the one honest reason to skip, and a caller that skips
 * says which binary it wanted — silence is what this module exists to end.
 * @returns the server binary's path, or undefined when none is installed.
 */
export async function sshdBinary(): Promise<string | undefined> {
  for (const candidate of SSHD_CANDIDATES) {
    try {
      await readFile(candidate)
      return candidate
    } catch {
      // Not at this path; try the next. A binary that exists but cannot be
      // read is equally unusable here.
    }
  }
  return undefined
}

/** A loopback port nothing is listening on, chosen by the OS. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const { port } = probe.address() as { port: number }
  await new Promise<void>((resolve) => { probe.close(() => { resolve() }) })
  return port
}

/**
 * Start one, authenticating the current user by a key generated for this run.
 *
 * @param binary - the `sshd` to run; from {@link sshdBinary}.
 * @returns the running server.
 * @throws when the server does not accept a connection within the timeout.
 */
export async function startDisposableSshd(binary: string): Promise<DisposableSshd> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sshd-'))
  const port = await freePort()
  const alias = 'dsh-test-machine'
  const hostKey = join(dir, 'host_key')
  const clientKey = join(dir, 'client_key')
  // No passphrase: a key that asked for one would be exactly the prompt this
  // whole area is meant to make impossible.
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', hostKey])
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', clientKey])
  const authorized = join(dir, 'authorized_keys')
  await writeFile(authorized, await readFile(`${clientKey}.pub`, 'utf8'))
  await chmod(authorized, 0o600)

  const serverConfig = join(dir, 'sshd_config')
  await writeFile(serverConfig, [
    `Port ${String(port)}`,
    'ListenAddress 127.0.0.1',
    `HostKey ${hostKey}`,
    `AuthorizedKeysFile ${authorized}`,
    // The generated tree lives under a world-readable temp directory, which
    // sshd otherwise refuses; nothing here outlives the test.
    'StrictModes no',
    'UsePAM no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    '',
  ].join('\n'))

  const configPath = join(dir, 'ssh_config')
  await writeFile(configPath, [
    `Host ${alias}`,
    '  HostName 127.0.0.1',
    `  Port ${String(port)}`,
    `  User ${userInfo().username}`,
    `  IdentityFile ${clientKey}`,
    '  IdentitiesOnly yes',
    // A per-run host key is unknown by definition, and a prompt about it would
    // hang the suite.
    '  StrictHostKeyChecking no',
    '  UserKnownHostsFile /dev/null',
    '',
  ].join('\n'))
  await chmod(configPath, 0o600)

  const child: ChildProcess = spawn(binary, ['-D', '-e', '-f', serverConfig], { stdio: ['ignore', 'ignore', 'pipe'] })
  const complaints: string[] = []
  child.stderr?.on('data', (chunk: Buffer) => { complaints.push(chunk.toString('utf8')) })

  const deadline = Date.now() + 10_000
  let listening = false
  while (!listening && Date.now() < deadline) {
    listening = await new Promise<boolean>((resolve) => {
      const probe = createServer()
      probe.once('error', () => { resolve(true) })
      probe.once('listening', () => { probe.close(() => { resolve(false) }) })
      probe.listen(port, '127.0.0.1')
    })
    if (!listening) await new Promise((resolve) => { setTimeout(resolve, 100) })
  }

  const stop = async (): Promise<void> => {
    child.kill('SIGTERM')
    await rm(dir, { recursive: true, force: true })
  }
  if (!listening) {
    await stop()
    throw new Error(`disposable sshd did not listen on ${String(port)}: ${complaints.join('').slice(0, 400)}`)
  }
  return { alias, configPath, port, stop }
}

/** The machine an e2e suite works against, however it was obtained. */
export interface TestMachine {
  /** The alias to connect to. */
  readonly alias: string
  /** The OpenSSH client configuration naming it. */
  readonly configPath: string
  /** Release it; a no-op for a server this process did not start. */
  stop(): Promise<void>
  /** Why there is none, when there is none. */
  readonly absent?: string
}

/**
 * The machine to test against: the one a person named, else one started here.
 *
 * `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS` still win, so anyone can point
 * a suite at a real box. What changed is the fallback: it used to be "skip
 * everything", which is how the remote path came to have no coverage at all.
 * @returns the machine, or one whose `absent` says why there is none.
 */
export async function testMachine(): Promise<TestMachine> {
  const configPath = process.env['DSH_SSH_TEST_CONFIG']
  const alias = process.env['DSH_SSH_TEST_ALIAS']
  if (configPath !== undefined && alias !== undefined) {
    return { alias, configPath, stop: () => Promise.resolve() }
  }
  const binary = await sshdBinary()
  if (binary === undefined) {
    return {
      alias: '',
      configPath: '',
      stop: () => Promise.resolve(),
      absent: `no sshd on this machine (looked in ${SSHD_CANDIDATES.join(', ')}); `
        + 'install openssh-server, or name a machine with DSH_SSH_TEST_CONFIG and DSH_SSH_TEST_ALIAS',
    }
  }
  return await startDisposableSshd(binary)
}
