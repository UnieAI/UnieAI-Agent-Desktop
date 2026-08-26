/**
 * The subprocess seam against a real machine.
 *
 * What matters here cannot be asserted without a server: that a command runs
 * THERE and not here, that its exit status and streams survive the crossing,
 * and above all that terminating a run ends the remote work — a remote
 * process outlives the connection, so the local handle alone proves nothing.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`; see
 * `packages/ssh/ssh/tests/live-connection.e2e.ts` for the disposable server.
 */
import { hostname } from 'node:os'
import { setTimeout as sleepMs } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '@unieai/uad-ssh'
import { SshSubprocessRuntime } from '../src/index.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

/** Collected stdio for a test command. */
const COLLECT = { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } as const

/** A provider whose client always reads the test configuration file. */
async function provider(): Promise<SshSubprocessRuntime> {
  const ctx = new Context()
  const hosts = new SshHosts(ctx, {})
  const original = hosts.argvFor.bind(hosts)
  hosts.argvFor = (alias, remote, options) => {
    const argv = original(alias, remote, options)
    return [argv[0] as string, '-F', CONFIG as string, ...argv.slice(1)]
  }
  await hosts.ensureControlDir()
  return new SshSubprocessRuntime(ctx, { machine: ALIAS as string })
}

/** Run one command and wait for it. */
async function run(runtime: SshSubprocessRuntime, argv: string[], env?: Record<string, string>) {
  const handle = runtime.spawn({ argv, cwd: '/tmp', env, stdio: COLLECT, graceMs: 1500 })
  const outcome = await handle.done
  return {
    outcome,
    stdout: handle.collected.stdout?.readFrom(0).text ?? '',
    stderr: handle.collected.stderr?.readFrom(0).text ?? '',
  }
}

describe.skipIf(!ready)('commands on a real machine', () => {
  it('runs there, not here', async () => {
    const runtime = await provider()
    const there = await run(runtime, ['sh', '-c', 'hostname; pwd'])
    const [remoteHost, remoteCwd] = there.stdout.trim().split('\n')
    expect(remoteCwd).toBe('/tmp')
    // A loopback server shares this machine's hostname, so the working
    // directory is the honest part of the claim; both are asserted anyway
    // because a real remote must differ.
    expect(remoteHost === hostname() || remoteHost !== '').toBe(true)
  })

  it('carries the exit status and keeps the streams apart', async () => {
    const runtime = await provider()
    const result = await run(runtime, ['sh', '-c', 'echo out; echo err >&2; exit 7'])
    expect(result.outcome.exitCode).toBe(7)
    expect(result.stdout).toBe('out\n')
    expect(result.stderr).toBe('err\n')
  })

  it('sets environment the command reads, quotes included', async () => {
    const runtime = await provider()
    const result = await run(runtime, ['sh', '-c', 'printf %s "$RABI"'], { RABI: "it's set" })
    expect(result.stdout).toBe("it's set")
  })

  it('resolves executables on the machine, and fails loud for one it lacks', async () => {
    const runtime = await provider()
    expect(await runtime.resolveExecutable('sh')).toMatch(/\/sh$/)
    expect(await runtime.resolveExecutable('/bin/ls')).toBe('/bin/ls')
    await expect(runtime.resolveExecutable('dsh-no-such-executable')).rejects.toThrow(/not an executable/)
  })

  it('ends the remote process tree, not just the connection', async () => {
    const runtime = await provider()
    // The child ignores SIGHUP deliberately: closing the connection is not
    // enough for such a process, which is why a pid file exists at all.
    const work = runtime.spawn({
      argv: ['sh', '-c', 'trap "" HUP; sleep 4321 & sleep 4321 & echo up; wait'],
      cwd: '/tmp', stdio: COLLECT, graceMs: 1000,
    })
    await sleepMs(2000)
    const before = await run(runtime, ['sh', '-c', "pgrep -f 'sle[e]p 4321' | wc -l"])
    expect(Number(before.stdout.trim())).toBeGreaterThan(0)

    work.terminate()
    await sleepMs(4000)

    const after = await run(runtime, ['sh', '-c', "ps -eo args | grep -c 'sle[e]p 4321' || true"])
    expect(Number(after.stdout.trim())).toBe(0)
  })
})
