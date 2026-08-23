/**
 * The browser notification seam: what each permission value reports, that a
 * request is what changes it, that showing is gated on a granted permission,
 * and that activating a notification runs the caller's handler.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserNotificationPort, type NotificationRequest } from '../src/client/notification-port.ts'

interface FakeNotification {
  readonly title: string
  readonly options: { body?: string; tag?: string } | undefined
  onclick: (() => void) | null
  readonly close: () => void
}

/** Install a fake Notification constructor at one permission value. */
function stubNotification(permission: string, requested?: string) {
  const raised: FakeNotification[] = []
  const close = vi.fn()
  let current = permission
  const constructor = function (this: FakeNotification, title: string, options?: { body?: string; tag?: string }) {
    const instance: FakeNotification = { title, options, onclick: null, close }
    raised.push(instance)
    return instance
  } as unknown as { new (title: string, options?: object): FakeNotification } & {
    permission: string
    requestPermission: () => Promise<string>
  }
  Object.defineProperty(constructor, 'permission', { get: () => current })
  constructor.requestPermission = vi.fn(async () => {
    current = requested ?? current
    return current
  })
  vi.stubGlobal('Notification', constructor)
  return { raised, close, requestPermission: constructor.requestPermission }
}

/** A request whose activation handler the suite can observe. */
function request(onActivate: () => void): NotificationRequest {
  return { title: 'Task complete', body: '“Refactor” finished', tag: 'session:7', onActivate }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('browser notification port', () => {
  it('reports unsupported where the API is absent', async () => {
    vi.stubGlobal('Notification', undefined)
    const port = browserNotificationPort()
    expect(port.access()).toBe('unsupported')
    await expect(port.request()).resolves.toBe('unsupported')
    expect(() => { port.show(request(() => {})) }).not.toThrow()
  })

  it('maps the browser permission values', () => {
    stubNotification('default')
    expect(browserNotificationPort().access()).toBe('default')
    stubNotification('granted')
    expect(browserNotificationPort().access()).toBe('granted')
    stubNotification('denied')
    expect(browserNotificationPort().access()).toBe('denied')
    // Anything the browser invents is treated as "not decided yet".
    stubNotification('prompt')
    expect(browserNotificationPort().access()).toBe('default')
  })

  it('reports the permission the user actually chose', async () => {
    const fake = stubNotification('default', 'granted')
    await expect(browserNotificationPort().request()).resolves.toBe('granted')
    expect(fake.requestPermission).toHaveBeenCalledOnce()
  })

  it('reads the permission value even when requestPermission rejects', async () => {
    stubNotification('denied')
    const notification = globalThis.Notification as unknown as { requestPermission: () => Promise<string> }
    notification.requestPermission = vi.fn(() => Promise.reject(new Error('gesture required')))
    await expect(browserNotificationPort().request()).resolves.toBe('denied')
  })

  it('raises nothing until permission is granted', () => {
    const undecided = stubNotification('default')
    browserNotificationPort().show(request(() => {}))
    expect(undecided.raised).toHaveLength(0)

    const blocked = stubNotification('denied')
    browserNotificationPort().show(request(() => {}))
    expect(blocked.raised).toHaveLength(0)
  })

  it('raises a tagged notification and runs the handler on activation', () => {
    const fake = stubNotification('granted')
    const onActivate = vi.fn()
    browserNotificationPort().show(request(onActivate))

    const raised = fake.raised[0]
    expect(raised?.title).toBe('Task complete')
    expect(raised?.options).toEqual({ body: '“Refactor” finished', tag: 'session:7' })

    raised?.onclick?.()
    expect(onActivate).toHaveBeenCalledOnce()
    expect(fake.close).toHaveBeenCalledOnce()
  })

  it('swallows a constructor that demands a service worker', () => {
    const constructor = function () { throw new Error('Illegal constructor') } as unknown as {
      permission: string
    }
    constructor.permission = 'granted'
    vi.stubGlobal('Notification', constructor)
    expect(() => { browserNotificationPort().show(request(() => {})) }).not.toThrow()
  })
})
