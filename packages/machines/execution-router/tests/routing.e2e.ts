/**
 * Switching machines, with a real one on the other end.
 *
 * The claim this suite exists for is that nothing above the two seams has to
 * know: the same `ctx.fs` and `ctx.subprocess` answer from one machine, then
 * from another, because a person changed their mind. And the claim that
 * makes it safe: a target resolved before the switch still belongs to the
 * machine it came from.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`; see
 * `packages/ssh/ssh/tests/live-connection.e2e.ts` for the disposable server.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import FileSettingsProvider from '@unieai/uad-settings-file'
import { SshHosts } from '@unieai/uad-ssh'
import { LOCAL_MACHINE, Machines } from '@unieai/uad-machines'
import { RoutedFileSystem, RoutedSubprocessRuntime } from '../src/index.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined
const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

/** Collected stdio for a test command. */
const COLLECT = { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } as const

/** A routed world over the test machine and this computer. */
async function routed() {
  const home = await mkdtemp(join(tmpdir(), 'dsh-routing-'))
  homes.push(home)
  const ctx = new Context()
  await ctx.plugin(FileSettingsProvider, { path: join(home, 'settings.yaml'), watch: false })
  const hosts = new SshHosts(ctx, { configPath: CONFIG as string })
  await hosts.ensureControlDir()
  const machines = new Machines(ctx, {})
  return {
    machines,
    fs: new RoutedFileSystem(ctx, { remoteCwd: '/tmp' }),
    subprocess: new RoutedSubprocessRuntime(ctx, {}),
  }
}

/**
 * Where one command ran.
 *
 * `SSH_CONNECTION` is set by sshd and by nothing else, so it reports whether
 * the command crossed a connection and which one — a hostname would not,
 * because a loopback test server shares this computer's name.
 */
async function connectionOf(subprocess: RoutedSubprocessRuntime): Promise<string> {
  const handle = subprocess.spawn({
    argv: ['sh', '-c', 'printf %s "${SSH_CONNECTION:-none}"'],
    cwd: '/tmp',
    stdio: COLLECT,
    graceMs: 1500,
  })
  await handle.done
  return handle.collected.stdout?.readFrom(0).text ?? ''
}

describe.skipIf(!ready)('working on one machine, then another', () => {
  it('lists this computer alongside the machines the person already reaches', async () => {
    const { machines } = await routed()
    const ids = (await machines.list()).map(target => target.id)
    expect(ids[0]).toBe(LOCAL_MACHINE)
    expect(ids).toContain(ALIAS)
  })

  it('sends commands to the machine that is current, with nothing above the seam told', async () => {
    const { machines, subprocess } = await routed()
    const before = await connectionOf(subprocess)

    await machines.select(ALIAS as string)
    const after = await connectionOf(subprocess)

    // The routed command crossed the test server's port; the earlier one did
    // not cross it, whatever else this process may be running inside.
    expect(after).not.toBe(before)
    expect(after).toMatch(/\d+ \d+/)
  })

  it('resolves paths in the machine that is current', async () => {
    const { machines, fs } = await routed()
    const here = await fs.resolve('/tmp')
    expect(String(here.targetKey)).not.toContain('ssh:')

    await machines.select(ALIAS as string)
    const there = await fs.resolve('/tmp')
    expect(String(there.targetKey)).toBe(`ssh:${ALIAS as string}:/tmp`)
  })

  it('keeps an already-resolved target on its own machine after the switch', async () => {
    const { machines, fs } = await routed()
    const local = await fs.resolve('/tmp')
    await machines.select(ALIAS as string)

    // The point of reading the machine out of the target: this must still be
    // the local directory, not the remote one with the same path.
    expect((await fs.stat(local))?.type).toBe('directory')
    expect(fs.processPath(local)).toBe('/tmp')
    expect(String(local.targetKey)).not.toContain('ssh:')
  })

  it('answers containment across machines with a plain no', async () => {
    const { machines, fs } = await routed()
    const local = await fs.resolve('/tmp')
    await machines.select(ALIAS as string)
    const remote = await fs.resolve('/tmp')
    expect(fs.contains(local, remote)).toBe(false)
    expect(fs.contains(remote, remote)).toBe(true)
  })

  it('reads a file from the machine it belongs to', async () => {
    const { machines, fs, subprocess } = await routed()
    await machines.select(ALIAS as string)
    const marker = `/tmp/dsh-routing-${String(process.pid)}.txt`
    const written = subprocess.spawn({
      argv: ['sh', '-c', `printf remote > ${marker}`],
      cwd: '/tmp', stdio: COLLECT, graceMs: 1500,
    })
    await written.done

    const target = await fs.resolve(marker)
    expect(await fs.readText(target)).toBe('remote')

    const cleaned = subprocess.spawn({ argv: ['rm', '-f', marker], cwd: '/tmp', stdio: COLLECT, graceMs: 1500 })
    await cleaned.done
  })
})
