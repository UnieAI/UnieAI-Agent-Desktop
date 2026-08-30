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
    // Reachable by default: picking a machine now TESTS it first, so a double
    // that refuses would make every switch case in this file a refusal case.
    // The cases that are about refusal say so by overriding this.
    probe: vi.fn().mockResolvedValue({ reachable: true, message: '' }),
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
    // Once for the pending state, once for what the reachability test found,
    // once for the answer. The middle one is why a slow machine shows its
    // result before the switch settles rather than after.
    expect(seen).toHaveBeenCalledTimes(3)
    stop()
    await view.select('local')
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('refuses a machine that does not answer, and stays where it was', async () => {
    // A machine is listed because it is CONFIGURED, not because it answers.
    // Switching to one that is down used to succeed and then fail every
    // command afterwards, far from the choice that caused it.
    const select = vi.fn()
    const probe = vi.fn().mockResolvedValue({ reachable: false, message: 'ssh: connect: host is down' })
    const view = createMachineView(routes({ select, probe }))
    await view.select('build-box')
    expect(select).not.toHaveBeenCalled()
    expect(view.getSnapshot()).toMatchObject({
      current: 'local',
      busy: false,
      error: 'ssh: connect: host is down',
    })
    // And the reachability it just learned is kept, so the row can say so.
    expect(view.getSnapshot().reachable['build-box']).toMatchObject({ ok: false })
  })

  it('names the machine when the refusal came with no words', async () => {
    const probe = vi.fn().mockResolvedValue({ reachable: false, message: '' })
    const view = createMachineView(routes({ probe }))
    await view.select('build-box')
    expect(view.getSnapshot().error).toBe('build-box did not answer')
  })

  it('does not spend a round trip testing this computer', async () => {
    // `local` is this process: it is always reachable, and probing it would
    // pay an SSH round trip to prove so.
    const probe = vi.fn().mockResolvedValue({ reachable: true, message: '' })
    const select = vi.fn().mockImplementation((machine: string) =>
      Promise.resolve({ ok: true, machines: [LOCAL, BUILD], current: machine }))
    const view = createMachineView(routes({ probe, select }))
    await view.select('build-box')
    await view.select('local')
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith('build-box')
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
