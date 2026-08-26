/**
 * Where the mascot lives, and what it is reacting to.
 *
 * The reaction comes from the session the person is looking at: `running` is
 * the harness's own answer to "is a turn in flight", and `runningCalls` says
 * whether that turn is thinking or doing something. Nothing here interprets
 * model output — a mascot that guessed at meaning would be wrong in a way
 * nobody could correct.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' seat).
import type {} from '@unieai/uad-client-ui-layout/client'
import type { PetReaction } from '../codex.ts'
import { PetSprite } from './PetSprite.tsx'
import css from './PetDock.module.css'

/** What the dock reads, bound at registration. */
export interface PetDockInjected {
  hooks: {
    /** The mascot's own state: which pet, and what the session is doing. */
    pet: PetView
  }
}

/** The snapshot the dock renders from. */
export interface PetState {
  /** Chosen pet id, or undefined while the mascot is off. */
  petId: string | undefined
  /** What the watched session is doing. */
  reaction: PetReaction
}

/** Read face of {@link PetState}, as the renderer binds it. */
export interface PetView {
  getSnapshot: () => PetState
  subscribe: (listener: () => void) => () => void
}

/** Slot owner props plus this feature's injected face. */
export type PetDockProps = PropsRuntime<'shell.overlay'> & InjectFace<PetDockInjected>

/**
 * Render the mascot over the app.
 * @param props - the overlay owner share and the pet face.
 * @returns the dock, or null when no pet is chosen.
 */
export function PetDock(props: PetDockProps): ReactNode {
  const { usePet } = props
  const state: PetState = usePet(snapshot => snapshot)
  if (state.petId === undefined) return null
  return (
    <div className={css['dock']} aria-hidden={state.reaction === 'idle'}>
      <PetSprite petId={state.petId} reaction={state.reaction} size={64} />
    </div>
  )
}
