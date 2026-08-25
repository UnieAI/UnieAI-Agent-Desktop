/**
 * Contract for the browser a person drives.
 * @module @unieai/uad-browser-operator/types
 */

/** Opaque identity minted for one operator-driven browser. */
export type OperatorBrowserId = string & { readonly __operatorBrowser: unique symbol }

/** Machine-routable operator-browser failures. */
export type OperatorBrowserErrorCode =
  | 'DISABLED'
  | 'NO_BROWSER'
  | 'NO_CHROME'
  | 'TOO_MANY_BROWSERS'
  | 'CLOSED'
  | 'BLOCKED_URL'

/** One operator-browser failure a caller can branch on without parsing prose. */
export class OperatorBrowserError extends Error {
  constructor(readonly code: OperatorBrowserErrorCode, message: string) {
    super(message)
    this.name = 'OperatorBrowserError'
  }
}

/** What one live or finished browser looks like to a client. */
export interface OperatorBrowserView {
  /** Identity minted at open; stable for the browser's whole life. */
  browserId: OperatorBrowserId
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
  /** False once the browser has exited; nothing more will arrive. */
  live: boolean
}

/** What a client must supply to open a browser. */
export interface OperatorBrowserOpenSpec {
  /** Workspace the browser belongs to. */
  workspaceId: string
  /** First address to visit. */
  url: string
  /** Viewport width the panel currently measures; clamped to at least 1. */
  width: number
  /** Viewport height the panel currently measures; clamped to at least 1. */
  height: number
}

/** A pointer gesture the panel forwards. */
export interface OperatorBrowserPointer {
  /** `mousePressed`, `mouseReleased`, or `mouseMoved`, as CDP names them. */
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel'
  /** Viewport-relative x, in the page's own CSS pixels. */
  x: number
  /** Viewport-relative y, in the page's own CSS pixels. */
  y: number
  /** Wheel delta, for `mouseWheel`. */
  deltaX?: number
  /** Wheel delta, for `mouseWheel`. */
  deltaY?: number
  /** Click count, so a double click is one gesture rather than two. */
  clickCount?: number
}

/** A keyboard gesture the panel forwards. */
export interface OperatorBrowserKey {
  /** `keyDown`, `keyUp`, or `char`, as CDP names them. */
  type: 'keyDown' | 'keyUp' | 'char'
  /** The `KeyboardEvent.key` value. */
  key?: string
  /** The `KeyboardEvent.code` value. */
  code?: string
  /** Text to insert, for `char`. */
  text?: string
  /** Bitfield: 1 alt, 2 ctrl, 4 meta, 8 shift — the CDP encoding. */
  modifiers?: number
}
