/**
 * What the mascot knows: which pet is chosen, and what the session the person
 * is looking at is doing.
 *
 * Two sources, one snapshot. The pet comes from this feature's own settings
 * scope; the activity comes from the sessions service — `running` is the
 * harness's own answer to "is a turn in flight", and `runningCalls` separates
 * a model that is thinking from one that is executing something. Nothing here
 * reads model output: a mascot that inferred meaning from text would be wrong
 * in a way nobody could correct.
 */

import type { ISessions, SettingsScope } from '@unieai/uad-client-runtime/client'
import type { PetReaction } from '../codex.ts'
import type { PetState, PetView } from './PetDock.tsx'
import type { PetSettings } from '../settings.ts'

/**
 * Derive the reaction from one session snapshot.
 *
 * `running` with tool calls in flight is WORKING — something is happening in
 * the world. `running` with none is thinking: the turn is open and nothing has
 * been dispatched yet. A settled session is idle, and a session that is
 * waiting on a person is `waiting` rather than idle, because those look
 * different to the person who is being waited on.
 * @param snapshot - the watched session's conversation snapshot.
 * @returns the reaction to play.
 */
export function reactionOf(snapshot: {
  running?: boolean
  runningCalls?: readonly unknown[]
  pending?: readonly unknown[]
} | undefined): PetReaction {
  if (snapshot === undefined) return 'idle'
  if ((snapshot.pending?.length ?? 0) > 0) return 'waiting'
  if (snapshot.running !== true) return 'idle'
  return (snapshot.runningCalls?.length ?? 0) > 0 ? 'working' : 'thinking'
}

/**
 * Build the view the dock renders from.
 *
 * Subscribes to both sources and re-reads on either. The session being watched
 * changes as a person moves between sessions, so the binding is resolved on
 * every read rather than captured once.
 * @param sessions - the client sessions service.
 * @param settings - this feature's bound settings scope.
 * @param defaultPetId - pet used when settings name none.
 * @returns a snapshot store the renderer can bind.
 */
export function createPetView(
  sessions: ISessions,
  settings: SettingsScope<PetSettings>,
  defaultPetId: string,
): PetView {
  let cached: PetState = { petId: undefined, reaction: 'idle' }
  const listeners = new Set<() => void>()

  const read = (): PetState => {
    // The snapshot has no value until the namespace has been read once; the
    // mascot is off until then rather than flashing the default pet.
    const value = settings.getSnapshot().value as Partial<PetSettings> | undefined
    if (value === undefined || value.enabled === false) return { petId: undefined, reaction: 'idle' }
    const current = sessions.list.getSnapshot().current
    const snapshot = current === undefined
      ? undefined
      : sessions.binding(current)?.session.getSnapshot()
    return { petId: value.pet ?? defaultPetId, reaction: reactionOf(snapshot) }
  }

  const refresh = (): void => {
    const next = read()
    // Reference stability matters: the dock is bound through a snapshot hook,
    // and a fresh object every tick would re-render the overlay continuously.
    if (next.petId === cached.petId && next.reaction === cached.reaction) return
    cached = next
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => cached,
    subscribe: (listener) => {
      if (listeners.size === 0) refresh()
      listeners.add(listener)
      const stops = [settings.subscribe(refresh), sessions.list.subscribe(refresh)]
      // The watched session's own snapshot changes far more often than the
      // list does, and only it reports a turn starting.
      const current = sessions.list.getSnapshot().current
      const session = current === undefined ? undefined : sessions.binding(current)?.session
      if (session !== undefined) stops.push(session.subscribe(refresh))
      return () => {
        listeners.delete(listener)
        for (const stop of stops) stop()
      }
    },
  }
}
