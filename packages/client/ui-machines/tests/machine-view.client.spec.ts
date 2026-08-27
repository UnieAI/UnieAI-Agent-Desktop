/**
 * What the machine control knows, and when it asks.
 *
 * The list comes from a file the person edits outside Rabi, so when it is
 * read matters as much as what it says: a cached list is stale exactly when
 * someone has just added the machine they are looking for.
 */
import { describe, expect, it, vi } from 'vitest'
import type { MachineRoutes } from '../src/client/machine-view.ts'
import { INITIAL_MACHINE_STATE, createMachineView } from '../src/client/machine-view.ts'

const LOCAL = { id: 'local', label: 'This computer', kind: 'local' as const }

/** Routes a test does not exercise still have to exist. */
function routes(partial: Partial<MachineRoutes>): MachineRoutes {
  const unused = vi.fn().mockResolvedValue({ ok: false, message: 'not part of this test' })
  return {
    list: unused, select: unused, add: unused, remove: unused,
    probe: vi.fn().mockResolvedValue({ reachable: false, message: 'not part of this test' }),
    ...partial,
  }
}
const BUILD = { id: 'build-box', label: 'build-box', kind: 'ssh' as const, source: '/home/dev/.ssh/config' }

describe('reading the machines', () => {
  it('starts with nothing read and this computer assumed', () => {
    const view = createMachineView(routes({}))
    expect(view.getSnapshot()).toEqual(INITIAL_MACHINE_STATE)
  })

  it('asks the host, and publishes what it said', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'local' })
    const view = createMachineView(routes({ list }))
    await view.refresh()
    expect(view.getSnapshot()).toMatchObject({ machines: [LOCAL, BUILD], current: 'local', busy: false })
  })

  it('keeps the machines it already had when a read fails', async () => {
    // A person who can still see the machines can still choose another one,
    // which is often the way out of whatever failed.
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: true, machines: [LOCAL, BUILD], current: 'local' })
      .mockResolvedValueOnce({ ok: false, message: 'the host is not answering' })
    const view = createMachineView(routes({ list }))
    await view.refresh()
    await view.refresh()
    expect(view.getSnapshot()).toMatchObject({ machines: [LOCAL, BUILD], error: 'the host is not answering' })
  })
})

describe('picking one', () => {
  it('switches, and takes the answer as the new truth', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'build-box' })
    const view = createMachineView(routes({ select }))
    await view.select('build-box')
    expect(select).toHaveBeenCalledWith('build-box')
    expect(view.getSnapshot().current).toBe('build-box')
  })

  it('does not ask the host to switch to the machine it is already on', async () => {
    const select = vi.fn()
    const view = createMachineView(routes({ select }))
    await view.select('local')
    expect(select).not.toHaveBeenCalled()
  })

  it('shows the host\'s own words when a switch is refused', async () => {
    const select = vi.fn().mockResolvedValue({ ok: false, message: "unknown machine 'typo-box'" })
    const view = createMachineView(routes({ select }))
    await view.select('typo-box')
    expect(view.getSnapshot()).toMatchObject({ current: 'local', error: "unknown machine 'typo-box'" })
  })

  it('tells its subscribers, once per change', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'build-box' })
    const view = createMachineView(routes({ select }))
    const seen = vi.fn()
    const stop = view.subscribe(seen)
    await view.select('build-box')
    // Once for the pending state, once for the answer.
    expect(seen).toHaveBeenCalledTimes(2)
    stop()
    await view.select('local')
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('writing a machine down', () => {
  it('takes the list the host answered with', async () => {
    const add = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'local' })
    const view = createMachineView(routes({ add }))
    expect(await view.add({ alias: 'build-box', hostName: '10.0.0.2' })).toBe(true)
    expect(add).toHaveBeenCalledWith({ alias: 'build-box', hostName: '10.0.0.2' })
    expect(view.getSnapshot().machines).toEqual([LOCAL, BUILD])
  })

  it('reports a refusal without claiming success', async () => {
    // The caller keeps the form open on false: a refused draft is still the
    // person's work, and clearing it would make them retype everything.
    const add = vi.fn().mockResolvedValue({ ok: false, message: '"*" is not a machine name' })
    const view = createMachineView(routes({ add }))
    expect(await view.add({ alias: '*' })).toBe(false)
    expect(view.getSnapshot().error).toBe('"*" is not a machine name')
  })
})

describe('removing a machine', () => {
  it('takes the list the host answered with', async () => {
    const remove = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL], current: 'local' })
    const view = createMachineView(routes({ remove }))
    await view.remove('build-box')
    expect(view.getSnapshot().machines).toEqual([LOCAL])
  })

  it('shows why an edit was refused, in the host\'s words', async () => {
    const remove = vi.fn().mockResolvedValue({ ok: false, message: '"red" shares a Host line with other machines' })
    const view = createMachineView(routes({ remove }))
    await view.remove('red')
    expect(view.getSnapshot().error).toContain('shares a Host line')
  })
})

describe('asking whether a machine answers', () => {
  it('remembers the answer per machine', async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce({ reachable: true, message: '' })
      .mockResolvedValueOnce({ reachable: false, message: 'Connection refused' })
    const view = createMachineView(routes({ probe }))
    await view.probe('build-box')
    await view.probe('gpu')
    expect(view.getSnapshot().reachable).toEqual({
      'build-box': { ok: true, message: '' },
      gpu: { ok: false, message: 'Connection refused' },
    })
  })
})
