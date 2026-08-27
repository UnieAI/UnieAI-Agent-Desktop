/**
 * What the machine control knows: the machines a person can pick, which one
 * they are on, and whether a pick is in flight.
 *
 * The list is fetched, not watched. Machines come from a file the person
 * edits outside Rabi, so the honest moment to read it is when they open the
 * menu — a cached list would be stale exactly when someone has just added
 * the machine they are looking for.
 */

import type { MachineEntry } from '@unieai/uad-api-remotes/client'

/** What the control renders from. */
export interface MachineState {
  /** Machines to choose from; empty until the first read finishes. */
  machines: MachineEntry[]
  /** Id of the machine work happens on. */
  current: string
  /** Whether a read or a pick is in flight. */
  busy: boolean
  /** What went wrong, in the host's own words. */
  error: string
}

/** A snapshot store the control binds to. */
export interface MachineView {
  getSnapshot(): MachineState
  subscribe(listener: () => void): () => void
}

/** What the view needs from the host. */
export interface MachineRoutes {
  /** Read the machines and the current one. */
  list(): Promise<{ ok: true; machines: MachineEntry[]; current: string } | { ok: false; message: string }>
  /** Pick one, answering with the list as it now stands. */
  select(machine: string): Promise<{ ok: true; machines: MachineEntry[]; current: string } | { ok: false; message: string }>
}

/** The state a control starts from, before anything has been read. */
export const INITIAL_MACHINE_STATE: MachineState = {
  machines: [],
  current: 'local',
  busy: false,
  error: '',
}

/**
 * Build the view.
 * @param routes - the host calls this view makes.
 * @returns a store plus the two gestures the control offers.
 */
export function createMachineView(routes: MachineRoutes): MachineView & {
  /** Read the machine list; called when the menu opens. */
  refresh(): Promise<void>
  /** Work on another machine. */
  select(machine: string): Promise<void>
} {
  let state = INITIAL_MACHINE_STATE
  const listeners = new Set<() => void>()

  const publish = (next: Partial<MachineState>): void => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const apply = (answer: Awaited<ReturnType<MachineRoutes['list']>>): void => {
    if (answer.ok) publish({ machines: answer.machines, current: answer.current, busy: false, error: '' })
    // The previous list is kept on failure: a person who can still see the
    // machines can still choose another one, which is often the way out.
    else publish({ busy: false, error: answer.message })
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: async () => {
      publish({ busy: true, error: '' })
      apply(await routes.list())
    },
    select: async (machine) => {
      if (machine === state.current) return
      publish({ busy: true, error: '' })
      apply(await routes.select(machine))
    },
  }
}
