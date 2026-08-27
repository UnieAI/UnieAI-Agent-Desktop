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
  /** Whether a read, a pick or an edit is in flight. */
  busy: boolean
  /** What went wrong, in the host's own words. */
  error: string
  /** The last reachability answer, keyed by machine. */
  reachable: Record<string, { ok: boolean; message: string }>
}

/** A snapshot store the control binds to. */
export interface MachineView {
  getSnapshot(): MachineState
  subscribe(listener: () => void): () => void
}

/** What a machine call answers with: the list as it now stands, or why not. */
export type MachineAnswer =
  | { ok: true; machines: MachineEntry[]; current: string }
  | { ok: false; message: string }

/** A machine a person is writing down. */
export interface MachineDraft {
  alias: string
  hostName?: string
  user?: string
  port?: number
  identityFile?: string
  proxyJump?: string
}

/** What the view needs from the host. */
export interface MachineRoutes {
  /** Read the machines and the current one. */
  list(): Promise<MachineAnswer>
  /** Pick one, answering with the list as it now stands. */
  select(machine: string): Promise<MachineAnswer>
  /** Write one into the person's own configuration. */
  add(draft: MachineDraft): Promise<MachineAnswer>
  /** Remove one from it. */
  remove(machine: string): Promise<MachineAnswer>
  /** Ask whether one answers right now. */
  probe(machine: string): Promise<{ reachable: boolean; message: string }>
}

/** The state a control starts from, before anything has been read. */
export const INITIAL_MACHINE_STATE: MachineState = {
  machines: [],
  current: 'local',
  busy: false,
  error: '',
  reachable: {},
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
  /** Write one into the person's own configuration. */
  add(draft: MachineDraft): Promise<boolean>
  /** Remove one from it. */
  remove(machine: string): Promise<void>
  /** Ask whether one answers right now. */
  probe(machine: string): Promise<void>
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
    add: async (draft) => {
      publish({ busy: true, error: '' })
      const answer = await routes.add(draft)
      apply(answer)
      // The caller closes its form only on success: a refused draft is
      // still the person's work, and clearing it would make them retype it
      // to fix one field.
      return answer.ok
    },
    remove: async (machine) => {
      publish({ busy: true, error: '' })
      apply(await routes.remove(machine))
    },
    probe: async (machine) => {
      publish({ busy: true, error: '' })
      const answer = await routes.probe(machine)
      publish({
        busy: false,
        reachable: { ...state.reachable, [machine]: { ok: answer.reachable, message: answer.message } },
      })
    },
  }
}
