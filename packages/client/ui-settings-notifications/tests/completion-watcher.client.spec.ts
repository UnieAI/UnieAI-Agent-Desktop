/**
 * Completion detection over the sessions list: only a running→idle edge counts,
 * the first snapshot arms nothing, a sub-threshold flicker is not a task, a
 * removed session did not finish, and a completion the user watched happen is
 * marked attended so nothing announces it.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@unieai/uad-api-remotes/client'
import {
  MIN_RUN_MS, SessionCompletionWatcher, browserCompletionEnvironment,
  type SessionCompletion, type SessionCompletionList,
} from '../src/client/completion-watcher.ts'

const ALPHA = 'alpha' as SessionId
const BETA = 'beta' as SessionId

/** A hand-driven list source plus the clock and visibility the watcher reads. */
function bench(initial: SessionCompletionList) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  let now = 1_000
  let visible = false
  const completions: SessionCompletion[] = []
  const watcher = new SessionCompletionWatcher(
    {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    { visible: () => visible, now: () => now },
    (completion) => { completions.push(completion) },
  )
  return {
    completions,
    watcher,
    listenerCount: () => listeners.size,
    setVisible: (next: boolean) => { visible = next },
    advance: (ms: number) => { now += ms },
    publish: (next: SessionCompletionList) => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** One list snapshot from `id → running` pairs. */
function list(rows: Record<string, boolean>, current?: SessionId): SessionCompletionList {
  const ids = Object.keys(rows) as SessionId[]
  const byId = Object.fromEntries(
    ids.map(id => [id, { running: rows[id] === true, displayTitle: `${id} session` }]),
  ) as SessionCompletionList['byId']
  return { ids, byId, current }
}

describe('session completion watcher', () => {
  it('announces nothing for the snapshot it starts on', () => {
    const b = bench(list({ alpha: false, beta: true }))
    const stop = b.watcher.start()
    expect(b.completions).toEqual([])
    stop()
  })

  it('reports the running→idle edge once, with the row\'s title', () => {
    const b = bench(list({ alpha: false }))
    const stop = b.watcher.start()
    b.publish(list({ alpha: true }))
    b.advance(MIN_RUN_MS)
    b.publish(list({ alpha: false }))

    expect(b.completions).toEqual([{ sessionId: ALPHA, title: 'alpha session', attended: false }])
    // A second idle snapshot is not a second completion.
    b.publish(list({ alpha: false }))
    expect(b.completions).toHaveLength(1)
    stop()
  })

  it('ignores a run shorter than the flicker threshold', () => {
    const b = bench(list({ alpha: false }))
    const stop = b.watcher.start()
    b.publish(list({ alpha: true }))
    b.advance(MIN_RUN_MS - 1)
    b.publish(list({ alpha: false }))
    expect(b.completions).toEqual([])
    stop()
  })

  it('marks a completion attended only while its own session is on screen', () => {
    const b = bench(list({ alpha: false, beta: false }, ALPHA))
    const stop = b.watcher.start()
    b.setVisible(true)

    b.publish(list({ alpha: true, beta: true }, ALPHA))
    b.advance(MIN_RUN_MS)
    b.publish(list({ alpha: false, beta: false }, ALPHA))
    expect(b.completions.map(c => [c.sessionId, c.attended])).toEqual([[ALPHA, true], [BETA, false]])

    // The same session finishing behind a hidden window is not attended.
    b.setVisible(false)
    b.publish(list({ alpha: true }, ALPHA))
    b.advance(MIN_RUN_MS)
    b.publish(list({ alpha: false }, ALPHA))
    expect(b.completions.at(-1)).toEqual({ sessionId: ALPHA, title: 'alpha session', attended: false })
    stop()
  })

  it('does not treat a removed session as a finished one', () => {
    const b = bench(list({ alpha: false }))
    const stop = b.watcher.start()
    b.publish(list({ alpha: true }))
    b.advance(MIN_RUN_MS)
    b.publish(list({}))
    expect(b.completions).toEqual([])

    // And a session that comes back is armed from scratch, not from its old bit.
    b.publish(list({ alpha: false }))
    expect(b.completions).toEqual([])
    stop()
  })

  it('measures a run from the first snapshot that showed it running', () => {
    const b = bench(list({ alpha: false }))
    const stop = b.watcher.start()
    b.publish(list({ alpha: true }))
    b.advance(MIN_RUN_MS)
    // A second running snapshot must not restart the clock.
    b.publish(list({ alpha: true }))
    b.publish(list({ alpha: false }))
    expect(b.completions).toHaveLength(1)
    stop()
  })

  it('skips a row the snapshot lists but does not carry', () => {
    const ids = [ALPHA] as SessionId[]
    const b = bench({ ids, byId: {}, current: undefined })
    const stop = b.watcher.start()
    expect(b.completions).toEqual([])
    stop()
  })

  it('unsubscribes and forgets its running bits on stop', () => {
    const b = bench(list({ alpha: false }))
    const stop = b.watcher.start()
    b.publish(list({ alpha: true }))
    expect(b.listenerCount()).toBe(1)

    stop()
    expect(b.listenerCount()).toBe(0)
    // A snapshot published while stopped reaches nobody.
    b.advance(MIN_RUN_MS)
    b.publish(list({ alpha: false }))
    expect(b.completions).toEqual([])

    // Restarting arms from the snapshot it finds, not from the bits it dropped.
    const restart = b.watcher.start()
    b.advance(MIN_RUN_MS)
    b.publish(list({ alpha: false }))
    expect(b.completions).toEqual([])
    restart()
  })
})

describe('browser completion environment', () => {
  it('counts a runtime without a document as not visible', () => {
    const environment = browserCompletionEnvironment()
    expect(environment.visible()).toBe(false)
    expect(environment.now()).toBeGreaterThan(0)
  })

  it('reads document.visibilityState when there is one', () => {
    vi.stubGlobal('document', { visibilityState: 'visible' })
    try {
      expect(browserCompletionEnvironment().visible()).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
