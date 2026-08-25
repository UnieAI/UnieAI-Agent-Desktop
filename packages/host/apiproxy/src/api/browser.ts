/**
 * Operator-browser domain: the browser a PERSON drives, over the wire.
 *
 * Loopback-pinned for the same reason the terminal is: the page runs on the
 * machine the Host runs on, reaches whatever that machine can reach, and its
 * frames are pictures of it. The model has its own web tools and cannot see or
 * touch anything in this domain.
 *
 * Frames do NOT come back through these calls. A page repaints whenever it
 * likes, so frames ride the host event stream as `browser/frame`.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One live or finished operator browser, as a client renders it. */
export interface BrowserView {
  /** Identity minted at open; stable for the browser's whole life. */
  browserId: string
  /** Workspace the browser belongs to. */
  workspaceId: string
  /** The page's current address. */
  url: string
  /** The page's current title, empty until one arrives. */
  title: string
  /** Last viewport the client reported. */
  width: number
  /** Last viewport the client reported. */
  height: number
  /** False once the browser has closed. */
  live: boolean
}

/** browser.open / browser.replay response value. */
export interface BrowserOpened {
  /** The browser itself. */
  browser: BrowserView
  /**
   * The most recent frame as base64 JPEG, so a reopened panel paints what the
   * page already looks like instead of an empty rectangle until it repaints.
   */
  frame?: string
}

/** Operator-browser domain surface. */
export interface BrowserApi {
  /** Every browser the Host holds, sent whole so two tabs converge. */
  list(request: RpcRequest<{}>, signal: AbortSignal): Promise<RpcResponse<{ browsers: BrowserView[] }>>

  /**
   * Open a browser on one address.
   *
   * `http` and `https` only: `file:` would turn a URL bar into a reader for
   * the host filesystem, and the schemes a browser treats specially reach the
   * browser itself rather than a page.
   */
  open(
    request: RpcRequest<{ workspaceId: string; url: string; width: number; height: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<BrowserOpened>>

  /** Re-read one browser and its most recent frame, for a reopened panel. */
  replay(
    request: RpcRequest<{ browserId: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<BrowserOpened>>

  /** Point a browser at another address, under the same scheme fence. */
  navigate(
    request: RpcRequest<{ browserId: string; url: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** Forward a pointer gesture, in the page's own coordinates. */
  pointer(
    request: RpcRequest<{
      browserId: string
      type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel'
      x: number
      y: number
      deltaX?: number
      deltaY?: number
      clickCount?: number
    }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** Forward a keyboard gesture. */
  key(
    request: RpcRequest<{
      browserId: string
      type: 'keyDown' | 'keyUp' | 'char'
      key?: string
      code?: string
      text?: string
      modifiers?: number
    }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** Tell the page its viewport changed. */
  resize(
    request: RpcRequest<{ browserId: string; width: number; height: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** End a browser and forget it. */
  close(
    request: RpcRequest<{ browserId: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>
}
