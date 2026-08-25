/** The browser half of the operator browser: gestures out, repaints in. */
import { Context } from '@unieai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserView, HostFrame, RpcRequest } from '@unieai/uad-api-remotes/client'
import { BrowserRuntime, BrowserRuntimeError } from '../src/client/browsers/service.ts'
import { FakeApiClient } from './fake-api.client.ts'

/**
 * @returns a runtime over a fake wire, plus that wire.
 */
function bench(): { runtime: BrowserRuntime; api: FakeApiClient } {
  // A fresh root per bench, for the terminal's reason: the service claims its
  // ctx key on construction and a shared root would refuse the second claim.
  const ctx = new Context()
  const api = new FakeApiClient()
  return { runtime: new BrowserRuntime(ctx, api), api }
}

/**
 * @param payload - the frame body.
 * @returns it wrapped as an envelope.
 */
function envelope(payload: HostFrame): RpcRequest<HostFrame> {
  return { rpcId: 'frame' as never, payload }
}

/**
 * @param over - fields to change.
 * @returns a browser view.
 */
function view(over: Partial<BrowserView> = {}): BrowserView {
  return {
    browserId: 'a', workspaceId: 'w', url: 'https://example.org/',
    title: 'example', width: 800, height: 600, live: true, ...over,
  }
}

describe('BrowserRuntime calls', () => {
  it('opens a browser on the address it was given', async () => {
    const { runtime, api } = bench()
    const opened = await runtime.open('w1', 'https://example.org/', 800, 600)
    expect(opened.browser.browserId).toBe('fk-browser')
    expect(api.calls.at(-1)).toMatchObject({
      method: 'browser.open',
      payload: { workspaceId: 'w1', url: 'https://example.org/', width: 800, height: 600 },
    })
  })

  it('sends a pointer gesture in the page\'s own coordinates', async () => {
    const { runtime, api } = bench()
    await runtime.pointer('b1', { type: 'mousePressed', x: 40, y: 12, clickCount: 1 })
    expect(api.calls.at(-1)).toMatchObject({
      method: 'browser.pointer',
      payload: { browserId: 'b1', type: 'mousePressed', x: 40, y: 12, clickCount: 1 },
    })
  })

  it('sends a keystroke with the modifier mask the page needs to read it', async () => {
    // Without modifiers a page cannot tell `a` from `Ctrl-A`, which is a
    // different keystroke rather than the same one with decoration.
    const { runtime, api } = bench()
    await runtime.key('b1', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 })
    expect(api.calls.at(-1)).toMatchObject({
      method: 'browser.key',
      payload: { browserId: 'b1', type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 },
    })
  })

  it('raises the Host code so a panel can say WHY, not just that it failed', async () => {
    const { runtime, api } = bench()
    api.failNext('browser.navigate', { code: 'browser-blocked-url', message: 'refused', details: {} })
    await expect(runtime.navigate('b1', 'file:///etc/passwd')).rejects.toBeInstanceOf(BrowserRuntimeError)
    await expect(runtime.navigate('b1', 'https://example.org/')).resolves.toBeUndefined()
  })
})

describe('BrowserRuntime frames', () => {
  it('delivers a repaint only to the renderer showing that browser', () => {
    const { runtime } = bench()
    const one: string[] = []
    const two: string[] = []
    runtime.subscribe('a', { frame: data => one.push(data), changed: () => {} })
    runtime.subscribe('b', { frame: data => two.push(data), changed: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'browser/frame', browserId: 'a', data: 'JPEG-A' }))
    expect(one).toEqual(['JPEG-A'])
    expect(two).toEqual([])
  })

  it('remembers the last frame so a reopened panel is not blank', () => {
    // A page that has finished loading and is sitting still sends nothing. A
    // panel mounting at that moment has no repaint to wait for, and without
    // this would show an empty rectangle over a perfectly good page.
    const { runtime } = bench()
    runtime.handleHostEnvelope(envelope({ type: 'browser/frame', browserId: 'a', data: 'JPEG-A' }))
    expect(runtime.lastFrame('a')).toBe('JPEG-A')
    runtime.handleHostEnvelope(envelope({ type: 'browser/frame', browserId: 'a', data: 'JPEG-B' }))
    expect(runtime.lastFrame('a')).toBe('JPEG-B')
  })

  it('stops delivering once a renderer unmounts, without ending the browser', () => {
    const { runtime } = bench()
    const seen: string[] = []
    const dispose = runtime.subscribe('a', { frame: data => seen.push(data), changed: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'browser/frame', browserId: 'a', data: 'first' }))
    dispose()
    runtime.handleHostEnvelope(envelope({ type: 'browser/frame', browserId: 'a', data: 'second' }))
    expect(seen).toEqual(['first'])
  })

  it('tells a renderer its own browser navigated, and not about the others', () => {
    const { runtime } = bench()
    const mine: BrowserView[] = []
    runtime.subscribe('a', { frame: () => {}, changed: next => mine.push(next) })
    runtime.handleHostEnvelope(envelope({
      type: 'browser/changed',
      browsers: [view({ url: 'https://other.example/', title: 'other' }), view({ browserId: 'b' })],
    }))
    expect(mine.map(one => one.url)).toEqual(['https://other.example/'])
  })

  it('publishes the whole list, which is what makes a second tab agree', () => {
    const { runtime } = bench()
    const one = view()
    runtime.handleHostEnvelope(envelope({ type: 'browser/changed', browsers: [one] }))
    expect(runtime.store.getSnapshot()).toEqual({ browsers: [one], ready: true })
  })

  it('adopts the newest live browser in a workspace, and none from another', () => {
    // Reattaching is what stops a reopened panel from stranding a real Chrome
    // process nothing on screen can reach.
    const { runtime } = bench()
    runtime.handleHostEnvelope(envelope({
      type: 'browser/changed',
      browsers: [
        view({ browserId: 'old', workspaceId: 'w1' }),
        view({ browserId: 'dead', workspaceId: 'w1', live: false }),
        view({ browserId: 'new', workspaceId: 'w1' }),
        view({ browserId: 'elsewhere', workspaceId: 'w2' }),
      ],
    }))
    expect(runtime.liveIn('w1')).toBe('new')
    expect(runtime.liveIn('w3')).toBeUndefined()
  })

  it('ignores frames that belong to other subsystems', () => {
    const { runtime } = bench()
    const seen: string[] = []
    runtime.subscribe('a', { frame: data => seen.push(data), changed: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'host/session-removed', sessionId: 's1' as never }))
    expect(seen).toEqual([])
    expect(runtime.store.getSnapshot().ready).toBe(false)
  })
})

describe('BrowserRuntime reconnect', () => {
  it('re-reads the list after a reconnect rather than assuming it survived', async () => {
    const { runtime, api } = bench()
    runtime.handleConnected()
    await vi.waitFor(() => {
      expect(api.calls.map(call => call.method)).toContain('browser.list')
    })
    expect(runtime.store.getSnapshot().ready).toBe(true)
  })

  it('treats a deployment with no browser service as an absent feature, not a failure', async () => {
    const { runtime, api } = bench()
    api.failNext('browser.list', { code: 'browser-unavailable', message: 'not composed', details: {} })
    await runtime.refresh()
    expect(runtime.store.getSnapshot()).toEqual({ browsers: [], ready: true })
  })
})
