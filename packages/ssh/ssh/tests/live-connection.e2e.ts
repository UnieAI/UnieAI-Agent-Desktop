/**
 * The book against a real OpenSSH server.
 *
 * Everything here is substrate behavior that no unit test can assert: what
 * `ssh -G` prints, whether multiplexing actually reuses a connection, and
 * whether a command's exit status, streams, and environment survive the
 * crossing. Set `DSH_SSH_TEST_CONFIG` to an OpenSSH configuration file and
 * `DSH_SSH_TEST_ALIAS` to a host in it that accepts a key with no passphrase;
 * without them the suite reports itself skipped rather than passing hollowly.
 *
 * A disposable server is enough:
 *   ssh-keygen -q -t ed25519 -N '' -f host_key
 *   ssh-keygen -q -t ed25519 -N '' -f id_test && cp id_test.pub authorized_keys
 *   /usr/sbin/sshd -f sshd_config   # Port 2222, ListenAddress 127.0.0.1
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts, remoteCommandLine } from '../src/index.ts'

const run = promisify(execFile)
const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

/** A book whose client always reads the test configuration file. */
function book(): SshHosts {
  return new SshHosts(new Context(), { configPath: CONFIG as string, connectTimeoutSeconds: 10 })
}

/** Run one remote command through the book's own argv. */
async function remote(hosts: SshHosts, line: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const [command, ...argv] = hosts.argvFor(ALIAS as string, line)
  try {
    const { stdout, stderr } = await run(command as string, argv, { encoding: 'utf8' })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

describe.skipIf(!ready)('the machine book against a real server', () => {
  it('resolves an alias to what the client would connect to', async () => {
    const hosts = book()
    const resolved = await hosts.resolve(ALIAS as string)
    expect(resolved.alias).toBe(ALIAS)
    expect(resolved.hostName).not.toBe('')
    expect(resolved.port).toBeGreaterThan(0)
  })

  it('reaches the machine, and says so in the client\'s own words when it cannot', async () => {
    const hosts = book()
    await hosts.ensureControlDir()
    expect(await hosts.probe(ALIAS as string)).toMatchObject({ reachable: true })

    const missing = await hosts.probe('dsh-no-such-host.invalid')
    expect(missing.reachable).toBe(false)
    expect(missing.message).not.toBe('')
  })

  it('reuses the connection, which is what makes remote work usable', async () => {
    const hosts = book()
    await hosts.ensureControlDir()
    await remote(hosts, remoteCommandLine(['true'], undefined))

    // Asserted as the master's existence rather than as elapsed time: a
    // duration comparison fails whenever the machine is busy, which is
    // exactly when a person is running commands.
    const control = hosts.controlPath()
    expect(control).toBeDefined()
    const check = await run('ssh', ['-F', CONFIG as string, '-o', `ControlPath=${control as string}`,
      '-O', 'check', ALIAS as string], { encoding: 'utf8' }).then(() => true, () => false)
    expect(check).toBe(true)

    await hosts.disconnect(ALIAS as string)
  })

  it('carries the exit status, and keeps the streams apart', async () => {
    const hosts = book()
    const result = await remote(hosts, remoteCommandLine(['sh', '-c', 'echo out; echo err >&2; exit 42'], undefined))
    expect(result.code).toBe(42)
    expect(result.stdout).toBe('out\n')
    // A terminal would fold stderr into stdout; the book asks for none.
    expect(result.stderr).toBe('err\n')
  })

  it('sets environment the command can read, quotes and all', async () => {
    const hosts = book()
    const result = await remote(hosts, remoteCommandLine(['sh', '-c', 'printf %s "$GREETING"'], undefined, { GREETING: "it's set" }))
    expect(result.stdout).toBe("it's set")
  })

  it('runs where it was told, and fails when that directory is missing', async () => {
    const hosts = book()
    expect((await remote(hosts, remoteCommandLine(['pwd'], '/tmp'))).stdout.trim()).toBe('/tmp')

    const missing = await remote(hosts, remoteCommandLine(['pwd'], '/dsh/no/such/dir'))
    expect(missing.code).toBe(127)
    expect(missing.stdout).toBe('')
  })

  it('carries bytes a naive transport would mangle', async () => {
    const hosts = book()
    const result = await remote(hosts, remoteCommandLine(['printf', '%s', '螢幕擷取 🎉'], undefined))
    expect(result.stdout).toBe('螢幕擷取 🎉')
  })
})
