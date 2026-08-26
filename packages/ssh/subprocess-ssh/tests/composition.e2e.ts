/**
 * The chain a model's Bash tool actually takes, on a real machine.
 *
 * Proving the provider in isolation is not the same as proving the harness:
 * what matters is that `dsh-bash-local` — which knows nothing about SSH —
 * runs its commands on the remote machine because this provider is the one
 * mounted. This test composes the two through Cordis and asserts against the
 * executor's own result, not the provider's.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`; see
 * `packages/ssh/ssh/tests/live-connection.e2e.ts` for the disposable server.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '@unieai/uad-ssh'
import { LocalBashExecutor } from '@unieai/uad-bash-local'
import { SshSubprocessRuntime } from '../src/index.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

/**
 * A context whose subprocess seam is the remote machine and whose shell seam
 * is the ordinary local Bash executor.
 */
async function composed(): Promise<Context> {
  const ctx = new Context()
  const hosts = new SshHosts(ctx, {})
  const original = hosts.argvFor.bind(hosts)
  hosts.argvFor = (alias, remote, options) => {
    const argv = original(alias, remote, options)
    return [argv[0] as string, '-F', CONFIG as string, ...argv.slice(1)]
  }
  await hosts.ensureControlDir()
  await ctx.plugin(SshSubprocessRuntime, { machine: ALIAS as string })
  await ctx.plugin(LocalBashExecutor, { cwd: '/tmp', timeoutMs: 20_000 })
  return ctx
}

describe.skipIf(!ready)('the Bash executor over a remote subprocess seam', () => {
  it('runs the model\'s commands on the machine, with no SSH knowledge of its own', async () => {
    const ctx = await composed()
    try {
      const result = await ctx.shell.run(ctx.shell.resolve({ command: 'pwd; id -un' }))
      const [cwd, user] = result.stdout.text.trim().split('\n')
      expect(cwd).toBe('/tmp')
      expect(user).not.toBe('')
      expect(result.exitCode).toBe(0)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('reports a remote failure as the command\'s own, not as a transport error', async () => {
    const ctx = await composed()
    try {
      const result = await ctx.shell.run(ctx.shell.resolve({ command: 'echo bad >&2; exit 3' }))
      expect(result.exitCode).toBe(3)
      expect(result.stderr.text.trim()).toBe('bad')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('runs where the request says, on the machine that has that directory', async () => {
    const ctx = await composed()
    try {
      const made = await ctx.shell.run(ctx.shell.resolve({ command: 'mkdir -p /tmp/dsh-ssh-compose && cd /tmp/dsh-ssh-compose && pwd' }))
      expect(made.stdout.text.trim()).toBe('/tmp/dsh-ssh-compose')

      const there = await ctx.shell.run(ctx.shell.resolve({ command: 'pwd', workdir: '/tmp/dsh-ssh-compose' }))
      expect(there.stdout.text.trim()).toBe('/tmp/dsh-ssh-compose')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
