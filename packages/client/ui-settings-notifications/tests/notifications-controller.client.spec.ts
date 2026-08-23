/**
 * The section's state owner: permission is only ever changed by the Enable
 * gesture, picking a cue stores and previews it, and an announcement plays the
 * cue whether or not notifications were granted while the desktop notification
 * itself waits for permission.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { NotificationsSettingsController } from '../src/client/notifications-controller.ts'
import type { NotificationAccess, NotificationRequest } from '../src/client/notification-port.ts'
import type { NotifySoundStorage } from '../src/client/notify-sounds.ts'

const SESSION = 'session-7' as SessionId

/** A controller over fully observable collaborators. */
function bench(options: { access?: NotificationAccess; granted?: NotificationAccess; stored?: string } = {}) {
  let access: NotificationAccess = options.access ?? 'default'
  const shown: NotificationRequest[] = []
  const played: string[] = []
  let value = options.stored ?? null
  const storage: NotifySoundStorage = {
    getItem: () => value,
    setItem: (_key, next) => { value = next },
  }
  const openSession = vi.fn()
  const focusWindow = vi.fn()
  const request = vi.fn(async () => {
    access = options.granted ?? 'denied'
    return access
  })
  const controller = new NotificationsSettingsController({
    port: {
      access: () => access,
      request,
      show: (notification) => {
        if (access !== 'granted') return
        shown.push(notification)
      },
    },
    player: { play: (id) => { played.push(id) } },
    storage,
    copy: {
      heading: () => 'Task complete',
      body: title => `“${title}” finished`,
    },
    openSession,
    focusWindow,
  })
  return {
    controller, shown, played, openSession, focusWindow, request,
    stored: () => value,
    revoke: (next: NotificationAccess) => { access = next },
  }
}

describe('notifications settings controller', () => {
  it('opens on the browser\'s current permission and the stored cue', () => {
    const b = bench({ access: 'granted', stored: 'portal' })
    expect(b.controller.getSnapshot()).toEqual({ access: 'granted', soundId: 'portal', requesting: false })
  })

  it('publishes the answer to a permission request', async () => {
    const b = bench({ access: 'default', granted: 'granted' })
    const seen: boolean[] = []
    const off = b.controller.subscribe(() => { seen.push(b.controller.getSnapshot().requesting) })

    await b.controller.enable()
    expect(b.request).toHaveBeenCalledOnce()
    expect(b.controller.getSnapshot()).toMatchObject({ access: 'granted', requesting: false })
    // The pending flag was published while the prompt was open, so the button
    // can disable itself rather than raising a second prompt.
    expect(seen).toContain(true)
    off()
  })

  it('refuses a second prompt while one is open', async () => {
    const b = bench({ access: 'default', granted: 'granted' })
    const first = b.controller.enable()
    await b.controller.enable()
    await first
    expect(b.request).toHaveBeenCalledOnce()
  })

  it('clears the pending flag when the prompt fails', async () => {
    const controller = new NotificationsSettingsController({
      port: {
        access: () => 'default',
        request: () => Promise.reject(new Error('gesture required')),
        show: () => {},
      },
      player: { play: () => {} },
      storage: undefined,
      copy: { heading: () => 'Task complete', body: title => title },
      openSession: () => {},
      focusWindow: () => {},
    })
    await expect(controller.enable()).rejects.toThrow('gesture required')
    expect(controller.getSnapshot().requesting).toBe(false)
  })

  it('stores and previews the chosen cue, and ignores an unknown one', () => {
    const b = bench()
    b.controller.chooseSound('cheer')
    expect(b.controller.getSnapshot().soundId).toBe('cheer')
    expect(b.stored()).toBe('cheer')
    expect(b.played).toEqual(['cheer'])

    b.controller.chooseSound('fanfare')
    expect(b.controller.getSnapshot().soundId).toBe('cheer')
    expect(b.played).toEqual(['cheer'])
  })

  it('stays quiet for a completion the user watched happen', () => {
    const b = bench({ access: 'granted' })
    b.controller.announce({ sessionId: SESSION, title: 'Refactor', attended: true })
    expect(b.played).toEqual([])
    expect(b.shown).toEqual([])
  })

  it('plays the cue for an unattended completion even without permission', () => {
    const b = bench({ access: 'default', stored: 'slide' })
    b.controller.announce({ sessionId: SESSION, title: 'Refactor', attended: false })
    expect(b.played).toEqual(['slide'])
    expect(b.shown).toEqual([])
  })

  it('raises a per-session notification once permission is granted', () => {
    const b = bench({ access: 'granted' })
    b.controller.announce({ sessionId: SESSION, title: '  Refactor  ', attended: false })

    const shown = b.shown[0]
    expect(shown?.title).toBe('Task complete')
    expect(shown?.body).toBe('“Refactor” finished')
    // Two completions of one session replace each other instead of stacking.
    expect(shown?.tag).toBe(`dsh-session-complete:${SESSION}`)

    shown?.onActivate()
    expect(b.focusWindow).toHaveBeenCalledOnce()
    expect(b.openSession).toHaveBeenCalledWith(SESSION)
  })

  it('re-reads a permission revoked outside the page', () => {
    const b = bench({ access: 'granted' })
    const listener = vi.fn()
    const off = b.controller.subscribe(listener)

    b.controller.refreshAccess()
    expect(listener).not.toHaveBeenCalled()

    b.revoke('denied')
    b.controller.refreshAccess()
    expect(b.controller.getSnapshot().access).toBe('denied')
    expect(listener).toHaveBeenCalledOnce()
    off()
  })
})
