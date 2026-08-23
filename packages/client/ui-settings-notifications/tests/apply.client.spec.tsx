// @vitest-environment jsdom
/**
 * The browser half on a real SlotRegistry and a real LocaleRuntime: the page
 * registers into the settings shell's section slot once that slot exists, its
 * nav label follows the active locale, the injected face carries the live
 * controller, a turn finishing on the composed sessions service reaches the
 * device as a cue plus a notification, and teardown empties the slot and drops
 * the list subscription (HMR safety).
 */
import { Context } from '@unieai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@unieai/uad-api-remotes/client'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { NotificationsSection } from '../src/client/NotificationsSection.tsx'
import type { NotificationsSectionInjected } from '../src/client/NotificationsSection.tsx'
import { MIN_RUN_MS } from '../src/client/completion-watcher.ts'
import { NOTIFY_SOUND_STORAGE_KEY } from '../src/client/notify-sounds.ts'

const SLOT = 'settings.section'
const ALPHA = 'alpha' as SessionId

interface FakeNotification { readonly title: string; readonly options: { body?: string; tag?: string } | undefined }

/** Stand in for the settings shell: declare the section slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

/** Install a granted Notification constructor and a silent Audio element. */
function stubBrowser() {
  const raised: FakeNotification[] = []
  const played: string[] = []
  const constructor = function (title: string, options?: { body?: string; tag?: string }) {
    raised.push({ title, options })
    return { onclick: null, close: () => {} }
  } as unknown as { permission: string; requestPermission: () => Promise<string> }
  constructor.permission = 'granted'
  constructor.requestPermission = vi.fn(() => Promise.resolve('granted'))
  vi.stubGlobal('Notification', constructor)
  vi.stubGlobal('Audio', class {
    volume = 1
    constructor(readonly src: string) { played.push(src) }
    play() { return Promise.resolve() }
  })
  return { raised, played }
}

/** A sessions service whose list this suite drives by hand. */
function fakeSessions() {
  let snapshot = {
    ids: [] as SessionId[],
    byId: {} as Record<string, { running: boolean; displayTitle: string }>,
    current: undefined as SessionId | undefined,
  }
  const listeners = new Set<() => void>()
  const opened: SessionId[] = []
  return {
    opened,
    listenerCount: () => listeners.size,
    service: {
      list: {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
      open: (id: SessionId) => { opened.push(id) },
    },
    publish: (running: boolean, current?: SessionId) => {
      snapshot = {
        ids: [ALPHA],
        byId: { [ALPHA]: { running, displayTitle: 'Refactor the loader' } },
        current,
      }
      for (const listener of [...listeners]) listener()
    },
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const sessions = fakeSessions()
  ctx.provide('sessions', sessions.service)
  return { ctx, locale, sessions, slots: ctx.get('slots') as SlotRegistry }
}

/** The registered section entry, or undefined while the slot is empty. */
function entryOf(slots: SlotRegistry) {
  return slots.entries(SLOT).find(candidate => candidate.options.id === 'notifications')
}

afterEach(() => {
  vi.unstubAllGlobals()
  // The cue is a per-device preference in real localStorage; one suite's
  // choice must not become the next one's starting state.
  localStorage.clear()
})

describe('ui-settings-notifications browser apply', () => {
  it('declares exactly the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until the settings shell declares the section slot', async () => {
    stubBrowser()
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareSections(b.slots)
    await Promise.resolve()
    expect(entryOf(b.slots)?.component).toBe(NotificationsSection)
    expect(entryOf(b.slots)?.options.order).toBe(5)
    expect(entryOf(b.slots)?.locale).toBe(NS)
  })

  it('labels the nav row from the active locale', async () => {
    stubBrowser()
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const label = entryOf(b.slots)?.options.label as () => string
    expect(label()).toBe('Notifications')
    for (const [id, expected] of [['zh-CN', '通知'], ['zh-TW', '通知'], ['ja', '通知']] as const) {
      b.locale.setLocale(id)
      expect(label()).toBe(expected)
    }
  })

  it('injects the live controller and the whole cue catalog', async () => {
    stubBrowser()
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const injected = (entryOf(b.slots)!.inject as unknown as () => NotificationsSectionInjected)()
    expect(Object.keys(injected)).toEqual(['hooks', 'sounds', 'enable', 'chooseSound'])
    expect(injected.sounds).toHaveLength(11)
    expect(injected.hooks.notifications.getSnapshot()).toEqual({
      access: 'granted', soundId: 'handoff', requesting: false,
    })

    injected.chooseSound('portal')
    expect(injected.hooks.notifications.getSnapshot().soundId).toBe('portal')
    // Per-device, and under the key the UnieAI Copilot web product uses.
    expect(localStorage.getItem(NOTIFY_SOUND_STORAGE_KEY)).toBe('portal')
  })

  it('announces a turn that finished while nobody was watching it', async () => {
    const browser = stubBrowser()
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    vi.useFakeTimers()
    try {
      b.sessions.publish(true)
      vi.advanceTimersByTime(MIN_RUN_MS)
      b.sessions.publish(false)
    } finally {
      vi.useRealTimers()
    }

    expect(browser.played).toEqual(['/sounds/notify/handoff.wav'])
    expect(browser.raised).toEqual([{
      title: 'Task complete',
      options: { body: '“Refactor the loader” finished', tag: `dsh-session-complete:${ALPHA}` },
    }])
  })

  it('stays quiet for the session already on screen in a visible window', async () => {
    const browser = stubBrowser()
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    vi.useFakeTimers()
    try {
      b.sessions.publish(true, ALPHA)
      vi.advanceTimersByTime(MIN_RUN_MS)
      b.sessions.publish(false, ALPHA)
    } finally {
      vi.useRealTimers()
    }

    expect(browser.played).toEqual([])
    expect(browser.raised).toEqual([])
  })

  it('withdraws the section and releases the list on teardown', async () => {
    stubBrowser()
    const b = await bench()
    declareSections(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(entryOf(b.slots)).toBeDefined()
    expect(b.sessions.listenerCount()).toBe(1)

    await fiber.dispose()
    expect(entryOf(b.slots)).toBeUndefined()
    expect(b.sessions.listenerCount()).toBe(0)
  })
})
