/**
 * What the machine control knows, and when it asks.
 *
 * The list comes from a file the person edits outside Rabi, so when it is
 * read matters as much as what it says: a cached list is stale exactly when
 * someone has just added the machine they are looking for.
 */
import { describe, expect, it, vi } from 'vitest'
import { INITIAL_MACHINE_STATE, createMachineView } from '../src/client/machine-view.ts'

const LOCAL = { id: 'local', label: 'This computer', kind: 'local' as const }
const BUILD = { id: 'build-box', label: 'build-box', kind: 'ssh' as const, source: '/home/dev/.ssh/config' }

describe('reading the machines', () => {
  it('starts with nothing read and this computer assumed', () => {
    const view = createMachineView({ list: vi.fn(), select: vi.fn() } as never)
    expect(view.getSnapshot()).toEqual(INITIAL_MACHINE_STATE)
  })

  it('asks the host, and publishes what it said', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'local' })
    const view = createMachineView({ list, select: vi.fn() } as never)
    await view.refresh()
    expect(view.getSnapshot()).toMatchObject({ machines: [LOCAL, BUILD], current: 'local', busy: false })
  })

  it('keeps the machines it already had when a read fails', async () => {
    // A person who can still see the machines can still choose another one,
    // which is often the way out of whatever failed.
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: true, machines: [LOCAL, BUILD], current: 'local' })
      .mockResolvedValueOnce({ ok: false, message: 'the host is not answering' })
    const view = createMachineView({ list, select: vi.fn() } as never)
    await view.refresh()
    await view.refresh()
    expect(view.getSnapshot()).toMatchObject({ machines: [LOCAL, BUILD], error: 'the host is not answering' })
  })
})

describe('picking one', () => {
  it('switches, and takes the answer as the new truth', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'build-box' })
    const view = createMachineView({ list: vi.fn(), select } as never)
    await view.select('build-box')
    expect(select).toHaveBeenCalledWith('build-box')
    expect(view.getSnapshot().current).toBe('build-box')
  })

  it('does not ask the host to switch to the machine it is already on', async () => {
    const select = vi.fn()
    const view = createMachineView({ list: vi.fn(), select } as never)
    await view.select('local')
    expect(select).not.toHaveBeenCalled()
  })

  it('shows the host\'s own words when a switch is refused', async () => {
    const select = vi.fn().mockResolvedValue({ ok: false, message: "unknown machine 'typo-box'" })
    const view = createMachineView({ list: vi.fn(), select } as never)
    await view.select('typo-box')
    expect(view.getSnapshot()).toMatchObject({ current: 'local', error: "unknown machine 'typo-box'" })
  })

  it('tells its subscribers, once per change', async () => {
    const select = vi.fn().mockResolvedValue({ ok: true, machines: [LOCAL, BUILD], current: 'build-box' })
    const view = createMachineView({ list: vi.fn(), select } as never)
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
