// The fixture has to be provably real, or it replaces one silence with another:
// a suite that "runs" against a server that is not there proves nothing. So
// this connects with the actual client and asserts the command crossed a
// connection.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sshdBinary, startDisposableSshd } from '../src/index.ts'
import type { DisposableSshd } from '../src/index.ts'

const run = promisify(execFile)
const binary = await sshdBinary()
let server: DisposableSshd | undefined

beforeAll(async () => {
  if (binary !== undefined) server = await startDisposableSshd(binary)
}, 30_000)

afterAll(async () => { await server?.stop() })

// The ONE honest reason to skip: no server software on this machine. It names
// the binary it wanted, so the reason is never a mystery.
describe.skipIf(binary === undefined)('a disposable server', () => {
  it('accepts the real client and runs the command', async () => {
    const { stdout } = await run('ssh', ['-F', server!.configPath, '-T', server!.alias, '--', 'echo ok'])
    expect(stdout.trim()).toBe('ok')
  }, 20_000)

  it('proves the command crossed a connection, which a hostname on loopback cannot', async () => {
    // SSH_CONNECTION is set by sshd and by nothing else.
    const { stdout } = await run('ssh', ['-F', server!.configPath, '-T', server!.alias, '--', 'printf %s "$SSH_CONNECTION"'])
    expect(stdout).toContain(String(server!.port))
  }, 20_000)

  it('refuses passwords, so nothing can hang waiting for a person', async () => {
    // Take away the only method the server accepts. A server that would fall
    // back to a password would now ask for one, and the run would hang instead
    // of failing — which is the failure mode this fixture must not have.
    await expect(run('ssh', [
      '-F', server!.configPath, '-o', 'PubkeyAuthentication=no', '-o', 'BatchMode=yes',
      '-T', server!.alias, '--', 'echo nope',
    ])).rejects.toThrow(/Permission denied/u)
  }, 20_000)
})
