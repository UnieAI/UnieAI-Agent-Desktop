/**
 * The browser half of the browser a PERSON drives.
 *
 * Same two directions as the terminal beside it. Everything the person does —
 * open, navigate, click, type, resize, close — is a call and gets an answer.
 * Everything the PAGE does happens whenever the page likes, so repaints arrive
 * as host frames and are delivered to whoever is currently rendering.
 *
 * This owns no rendering and no image of its own beyond the last frame, which
 * it keeps for exactly one reason: a panel that mounts between repaints would
 * otherwise show an empty rectangle over a page that is perfectly fine.
 */

import type { Context } from '@unieai/cordis'
import type { BrowserView, IApiClient, RpcRequest, HostFrame } from '@unieai/uad-api-remotes/client'
import type { SnapshotStore } from '../contract/store.ts'
import { createSnapshotStore } from '../contract/store.ts'

/** Every operator browser the Host holds, as the panel sees them. */
export interface BrowserListState {
  browsers: readonly BrowserView[]
  /** True once the first list has arrived; a panel shows nothing before it. */
  ready: boolean
}

/** A pointer gesture in the page's own coordinates. */
export interface BrowserPointer {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel'
  x: number
  y: number
  deltaX?: number
  deltaY?: number
  clickCount?: number
}

/** A keyboard gesture. */
export interface BrowserKey {
  type: 'keyDown' | 'keyUp' | 'char'
  key?: string
  code?: string
  text?: string
  modifiers?: number
}

/** What one mounted renderer is told. */
export interface BrowserSink {
  /**
   * The page repainted.
   * @param data - base64 JPEG of the whole viewport.
   */
  frame: (data: string) => void
  /**
   * The browser itself changed — it navigated, retitled, or ended.
   *
   * Delivered per browser rather than left to the renderer to select out of
   * the list, because a renderer watching the whole list would re-render on
   * another workspace's navigation, and the only row it ever wanted was its
   * own.
   * @param view - the browser as it now is.
   */
  changed: (view: BrowserView) => void
}

/** A structured browser failure a panel can branch on. */
export class BrowserRuntimeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'BrowserRuntimeError'
  }
}

/**
 * Operator browsers as UI consumers see them.
 *
 * Registered on the client context alongside `panelTerminals`, for the same
 * reason: a panel reaches a capability by name rather than being handed an API
 * client and asked to remember which methods are loopback-pinned.
 */
export class BrowserRuntime {
  /** Every browser the Host holds; a panel renders its tab strip from this. */
  readonly store: SnapshotStore<BrowserListState>
  private readonly sinks = new Map<string, Set<BrowserSink>>()
  /**
   * The most recent frame per browser.
   *
   * Kept because a repaint is the ONLY thing that puts pixels on the panel: a
   * page that has finished loading and is sitting still sends nothing, so a
   * panel mounting at that moment would stay blank until the person happened
   * to touch something. One frame per browser, replaced not accumulated.
   */
  private readonly lastFrames = new Map<string, string>()

  /**
   * @param ctx - client plugin context this service registers on.
   * @param api - the wire face.
   */
  constructor(ctx: Context, private readonly api: IApiClient) {
    this.store = createSnapshotStore<BrowserListState>({ browsers: [], ready: false })
    ctx.reflect.provide('panelBrowsers', this, undefined)
  }

  /**
   * Open a browser on one address.
   * @param workspaceId - workspace the browser belongs to.
   * @param url - the address to open; `http` and `https` only.
   * @param width - viewport width the panel measures.
   * @param height - viewport height the panel measures.
   * @returns the new browser and its first frame when one was ready.
   */
  async open(workspaceId: string, url: string, width: number, height: number): Promise<{
    browser: BrowserView
    frame?: string
  }> {
    const response = await this.api.browser.open({ workspaceId, url, width, height })
    const opened = this.value(response.result, 'open')
    if (opened.frame !== undefined) this.lastFrames.set(opened.browser.browserId, opened.frame)
    return opened
  }

  /**
   * The live browser already running for one workspace, if any.
   *
   * Newest first, matching the terminal: the last one opened is the one the
   * person was last looking at.
   * @param workspaceId - the workspace to look in.
   * @returns its newest live browser's id, or undefined.
   */
  liveIn(workspaceId: string): string | undefined {
    const { browsers } = this.store.getSnapshot()
    return [...browsers].reverse()
      .find(browser => browser.live && browser.workspaceId === workspaceId)?.browserId
  }

  /**
   * The last frame this client saw for one browser.
   * @param browserId - the browser to look up.
   * @returns base64 JPEG, or undefined before the first repaint.
   */
  lastFrame(browserId: string): string | undefined {
    return this.lastFrames.get(browserId)
  }

  /**
   * Re-read a browser and its most recent frame, for a reopened panel.
   * @param browserId - the browser to read.
   * @returns the browser and the frame the Host last produced.
   */
  async replay(browserId: string): Promise<{ browser: BrowserView; frame?: string }> {
    const response = await this.api.browser.replay({ browserId })
    const replayed = this.value(response.result, 'replay')
    if (replayed.frame !== undefined) this.lastFrames.set(browserId, replayed.frame)
    return replayed
  }

  /**
   * Point a browser at another address.
   * @param browserId - the browser to navigate.
   * @param url - the address; `http` and `https` only.
   */
  async navigate(browserId: string, url: string): Promise<void> {
    const response = await this.api.browser.navigate({ browserId, url })
    this.value(response.result, 'navigate')
  }

  /**
   * Forward a pointer gesture.
   *
   * Not chained the way keystrokes are: a pointer event carries its own
   * absolute coordinates, so two that arrive out of order describe the same
   * two places they always did. Ordering matters for a stream of characters,
   * not for a stream of positions.
   * @param browserId - the browser to point at.
   * @param gesture - the gesture, in page coordinates.
   */
  async pointer(browserId: string, gesture: BrowserPointer): Promise<void> {
    const response = await this.api.browser.pointer({ browserId, ...gesture })
    this.value(response.result, 'pointer')
  }

  /**
   * Forward a keyboard gesture.
   * @param browserId - the browser to type into.
   * @param gesture - the gesture.
   */
  async key(browserId: string, gesture: BrowserKey): Promise<void> {
    const response = await this.api.browser.key({ browserId, ...gesture })
    this.value(response.result, 'key')
  }

  /**
   * Tell the page its viewport changed.
   * @param browserId - the browser to resize.
   * @param width - viewport width.
   * @param height - viewport height.
   */
  async resize(browserId: string, width: number, height: number): Promise<void> {
    const response = await this.api.browser.resize({ browserId, width, height })
    this.value(response.result, 'resize')
  }

  /**
   * End a browser and forget it.
   * @param browserId - the browser to close.
   */
  async close(browserId: string): Promise<void> {
    this.lastFrames.delete(browserId)
    const response = await this.api.browser.close({ browserId })
    this.value(response.result, 'close')
  }

  /**
   * Receive one browser's repaints while a renderer is mounted.
   * @param browserId - the browser to follow.
   * @param sink - where its frames go.
   * @returns disposer that removes exactly this subscription.
   */
  subscribe(browserId: string, sink: BrowserSink): () => void {
    const existing = this.sinks.get(browserId) ?? new Set<BrowserSink>()
    existing.add(sink)
    this.sinks.set(browserId, existing)
    return () => {
      const live = this.sinks.get(browserId)
      if (live === undefined) return
      live.delete(sink)
      if (live.size === 0) this.sinks.delete(browserId)
    }
  }

  /**
   * Route one host frame.
   * @param envelope - the frame as it arrived.
   */
  handleHostEnvelope(envelope: RpcRequest<HostFrame>): void {
    const frame = envelope.payload
    if (frame.type === 'browser/frame') {
      this.lastFrames.set(frame.browserId, frame.data)
      for (const sink of this.sinks.get(frame.browserId) ?? []) sink.frame(frame.data)
      return
    }
    if (frame.type === 'browser/changed') {
      this.store.update((state) => {
        state.browsers = frame.browsers
        state.ready = true
      })
      for (const browser of frame.browsers) {
        for (const sink of this.sinks.get(browser.browserId) ?? []) sink.changed(browser)
      }
    }
  }

  /** Re-baseline after a reconnect. */
  handleConnected(): void {
    void this.refresh()
  }

  /** Read the Host's list and publish it. */
  async refresh(): Promise<void> {
    const response = await this.api.browser.list({})
    if (!response.result.ok) {
      // A deployment that composes no browser service answers this way, and
      // that is an absent feature rather than a failure state.
      this.store.update((state) => {
        state.browsers = []
        state.ready = true
      })
      return
    }
    const { browsers } = response.result.value
    this.store.update((state) => {
      state.browsers = browsers
      state.ready = true
    })
  }

  /**
   * Unwrap one wire result.
   * @param result - the result as it arrived.
   * @param method - the call, for the message.
   * @returns the value when the call succeeded.
   */
  private value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }, method: string): T {
    if (result.ok) return result.value
    throw new BrowserRuntimeError(result.error.code, `browser.${method}: ${result.error.message}`)
  }
}

declare module '@unieai/cordis' {
  interface Context {
    panelBrowsers: BrowserRuntime
  }
}
