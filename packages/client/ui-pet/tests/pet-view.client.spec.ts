/**
 * What the mascot shows, given what the session is doing.
 *
 * The mapping is the feature: a mascot that animates while nothing is
 * happening — or sits still through a running turn — is worse than none,
 * because it teaches the person to stop looking at it.
 */
import { describe, expect, it, vi } from 'vitest'
import { createPetView, reactionOf } from '../src/client/pet-view.ts'
import type { PetSettings } from '../src/settings.ts'

describe('reading the session', () => {
  it('is idle when nothing is in flight', () => {
    expect(reactionOf(undefined)).toBe('idle')
    expect(reactionOf({ running: false })).toBe('idle')
  })

  it('thinks while a turn is open with nothing dispatched', () => {
    expect(reactionOf({ running: true, runningCalls: [] })).toBe('thinking')
  })

  it('works while a tool call is in flight, because that is happening in the world', () => {
    expect(reactionOf({ running: true, runningCalls: [{}] })).toBe('working')
  })

  it('waits when the turn is waiting on a person, which is not the same as idle', () => {
    // The person being waited on is exactly who should be able to tell.
    expect(reactionOf({ running: true, pending: [{}] })).toBe('waiting')
    expect(reactionOf({ running: false, pending: [{}] })).toBe('waiting')
  })
})

/** A settings scope whose value the test drives. */
function fakeSettings(value: Partial<PetSettings>) {
  const listeners = new Set<() => void>()
  return {
    scope: {
      getSnapshot: () => ({ value }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      set: vi.fn(),
      unset: vi.fn(),
    },
    change(next: Partial<PetSettings>) {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** A sessions service with one watched session the test drives. */
function fakeSessions(initial: { running: boolean; runningCalls?: unknown[] }) {
  const listeners = new Set<() => void>()
  let snapshot = initial
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ current: 's1' }),
        subscribe: () => () => undefined,
      },
      binding: () => ({
        session: {
          getSnapshot: () => snapshot,
          subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
        },
      }),
    },
    change(next: { running: boolean; runningCalls?: unknown[] }) {
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

describe('the view the dock renders', () => {
  it('follows the session without handing out a new object every tick', () => {
    const settings = fakeSettings({ pet: 'boxcat' })
    const sessions = fakeSessions({ running: false })
    const view = createPetView(sessions.sessions as never, settings.scope as never, 'boxcat')
    const notified = vi.fn()
    view.subscribe(notified)

    expect(view.getSnapshot()).toEqual({ petId: 'boxcat', reaction: 'idle' })

    sessions.change({ running: true, runningCalls: [] })
    expect(view.getSnapshot().reaction).toBe('thinking')
    expect(notified).toHaveBeenCalledTimes(1)

    // Same state again: the overlay must not re-render on an unchanged answer.
    const before = view.getSnapshot()
    sessions.change({ running: true, runningCalls: [] })
    expect(view.getSnapshot()).toBe(before)
    expect(notified).toHaveBeenCalledTimes(1)
  })

  it('shows nothing at all when the mascot is turned off', () => {
    const settings = fakeSettings({ enabled: false, pet: 'boxcat' })
    const sessions = fakeSessions({ running: true, runningCalls: [{}] })
    const view = createPetView(sessions.sessions as never, settings.scope as never, 'boxcat')
    view.subscribe(() => undefined)
    expect(view.getSnapshot().petId).toBeUndefined()

    settings.change({ enabled: true, pet: 'bitty' })
    expect(view.getSnapshot()).toEqual({ petId: 'bitty', reaction: 'working' })
  })

  it('falls back to the composition default when settings name no pet', () => {
    const settings = fakeSettings({})
    const sessions = fakeSessions({ running: false })
    const view = createPetView(sessions.sessions as never, settings.scope as never, 'boxcat')
    view.subscribe(() => undefined)
    expect(view.getSnapshot().petId).toBe('boxcat')
  })
})
