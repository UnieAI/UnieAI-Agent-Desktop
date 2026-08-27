/**
 * Which machines exist, and which one a person is working on.
 *
 * The list is not this package's to keep — it is `local` plus the aliases in
 * the person's own OpenSSH configuration — so these tests pin what the
 * service adds around that: this computer is always available, the choice
 * survives a restart, and an unpickable machine is refused.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@unieai/cordis'
import FileSettingsProvider from '@unieai/uad-settings-file'
import { LOCAL_MACHINE, Machines } from '../src/index.ts'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

/** A service over a real settings document in a temporary directory. */
async function service(options: { aliases?: string[]; home?: string } = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), 'dsh-machines-'))
  if (options.home === undefined) homes.push(home)
  const ctx = new Context()
  await ctx.plugin(FileSettingsProvider, { path: join(home, 'settings.yaml'), watch: false })
  if (options.aliases !== undefined) {
    ctx.provide('ssh', {
      list: () => Promise.resolve(options.aliases?.map(alias => ({ alias, source: '/home/dev/.ssh/config' })) ?? []),
    } as never)
  }
  return { machines: new Machines(ctx, {}), home, ctx }
}

describe('the machines a person can pick', () => {
  it('always offers this computer, even with no ssh configuration at all', async () => {
    const { machines } = await service()
    const listed = await machines.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: LOCAL_MACHINE, kind: 'local' })
  })

  it('offers this computer first, then the machines the person already reaches', async () => {
    const { machines } = await service({ aliases: ['build-box', 'gpu'] })
    expect((await machines.list()).map(target => target.id)).toEqual([LOCAL_MACHINE, 'build-box', 'gpu'])
  })

  it('keeps the first of a duplicated alias, as OpenSSH itself does', async () => {
    const { machines } = await service({ aliases: ['build-box', 'build-box'] })
    expect((await machines.list()).map(target => target.id)).toEqual([LOCAL_MACHINE, 'build-box'])
  })

  it('says where a machine was declared, so a person can go and edit it', async () => {
    const { machines } = await service({ aliases: ['build-box'] })
    expect((await machines.list())[1]?.source).toBe('/home/dev/.ssh/config')
  })

  it('labels this computer as the composition names it', async () => {
    const ctx = new Context()
    const home = await mkdtemp(join(tmpdir(), 'dsh-machines-'))
    homes.push(home)
    await ctx.plugin(FileSettingsProvider, { path: join(home, 'settings.yaml'), watch: false })
    const machines = new Machines(ctx, { localLabel: 'MacBook' })
    expect((await machines.list())[0]?.label).toBe('MacBook')
  })
})

describe('the machine work happens on', () => {
  it('starts as this computer', async () => {
    const { machines } = await service({ aliases: ['build-box'] })
    expect(machines.current).toBe(LOCAL_MACHINE)
  })

  it('remembers a choice across a restart', async () => {
    const first = await service({ aliases: ['build-box'] })
    await first.machines.select('build-box')
    expect(first.machines.current).toBe('build-box')

    // A second service over the same document is what a restart looks like.
    const second = await service({ aliases: ['build-box'], home: first.home })
    expect(second.machines.current).toBe('build-box')
  })

  it('refuses a machine nothing offers, and says what there is', async () => {
    const { machines } = await service({ aliases: ['build-box'] })
    // Storing it would leave a Rabi that fails every command until the person
    // finds the setting again.
    await expect(machines.select('typo-box')).rejects.toThrow(/unknown machine 'typo-box'.*local, build-box/s)
    expect(machines.current).toBe(LOCAL_MACHINE)
  })

  it('tells a watcher when the machine changed, and only then', async () => {
    const { machines } = await service({ aliases: ['build-box'] })
    const seen = vi.fn()
    const stop = machines.watch(seen)
    await machines.select('build-box')
    await vi.waitFor(() => { expect(seen).toHaveBeenCalledWith('build-box') })

    seen.mockClear()
    await machines.select('build-box')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(seen).not.toHaveBeenCalled()
    stop()
  })
})
