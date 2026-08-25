/**
 * The DevTools Protocol connection, as much of it as one panel needs.
 *
 * This is a websocket and a request/response correlation table, not a browser
 * automation library. The panel sends five kinds of message — navigate, a
 * pointer gesture, a key gesture, a resize, a screencast acknowledgement — and
 * listens for two — a frame and a navigation. A driver that could do more
 * would be more to keep correct, and none of the rest is reachable from a
 * surface whose whole vocabulary is "click here" and "type this".
 * @module @unieai/uad-browser-operator/cdp
 */

import { WebSocket } from 'ws'

/** One inbound frame: a reply to a command, or an event. */
interface CdpMessage {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
  method?: string
  params?: Record<string, unknown>
}

/** One CDP event, as the wire delivers it. */
export interface CdpEvent {
  method: string
  params: Record<string, unknown>
}

/** A live DevTools session against one target. */
export class CdpConnection {
  private readonly socket: WebSocket
  private readonly pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void
    reject: (reason: Error) => void
  }>()
  private readonly listeners = new Set<(event: CdpEvent) => void>()
  private readonly methods = new Map<number, string>()
  private nextId = 1
  private closed = false

  /**
   * @param endpoint - the `ws://` address the browser printed.
   */
  constructor(endpoint: string) {
    this.socket = new WebSocket(endpoint, { maxPayload: 256 * 1024 * 1024 })
    this.socket.on('message', (data: Buffer) => { this.receive(data) })
    // A dead socket settles every waiting call: a caller blocked on a reply
    // that can no longer arrive is worse than one told the browser is gone.
    this.socket.on('close', () => { this.fail(new Error('cdp: connection closed')) })
    this.socket.on('error', (error: Error) => { this.fail(error) })
  }

  /** Resolves once the socket is usable. */
  ready(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.socket.once('open', () => { resolve() })
      this.socket.once('error', (error: Error) => { reject(error) })
    })
  }

  /**
   * Send one command and wait for its reply.
   * @param method - the CDP method name.
   * @param params - its parameters.
   * @returns the reply's result object.
   */
  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.sendTo(undefined, method, params)
  }

  /**
   * Send one command to an attached target's session.
   *
   * The browser-level connection can enumerate targets and little else; a page
   * is driven by addressing its session, which is what `flatten: true`
   * attachment is for. One socket carries both, so there is no second
   * connection to keep alive or tear down.
   * @param sessionId - the attached session, or undefined for the browser itself.
   * @param method - the CDP method name.
   * @param params - its parameters.
   * @returns the reply's result object.
   */
  sendTo(
    sessionId: string | undefined, method: string, params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error('cdp: connection closed'))
    const id = this.nextId++
    const message = JSON.stringify({
      id, method, params,
      ...sessionId === undefined ? {} : { sessionId },
    })
    this.methods.set(id, sessionId === undefined ? method : `${method}[session]`)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      // The callback is re-typed because `ws` DECLARES it as `(err?: Error)`
      // and CALLS it with `null` on success. Trusting the declaration and
      // guarding on `error === undefined` alone treats every successful send
      // as a failure and rejects the call with `null` — which surfaces two
      // layers up as an `internal` error whose whole message is the string
      // "null". Both nullish values mean the frame went out.
      this.socket.send(message, (error: Error | null | undefined) => {
        if (error === undefined || error === null) return
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  /**
   * Watch every event this connection receives.
   * @param listener - called per event.
   * @returns disposer that removes exactly this listener.
   */
  on(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Close the socket and settle everything waiting on it. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.socket.close()
    this.fail(new Error('cdp: connection closed'))
  }

  /**
   * Route one inbound message: a reply to a caller, an event to the listeners.
   * @param data - the frame's bytes.
   */
  private receive(data: Buffer): void {
    let message: CdpMessage
    try {
      message = JSON.parse(data.toString('utf8')) as CdpMessage
    } catch {
      // A frame this build cannot parse is a protocol version it does not
      // know; dropping it keeps the connection usable for everything it does.
      return
    }
    if (message.id !== undefined) {
      const waiting = this.pending.get(message.id)
      if (waiting === undefined) return
      this.pending.delete(message.id)
      if (message.error !== undefined) {
        // The method is in the message: a bare protocol error names neither
        // the command nor the session, which is the whole of what a reader
        // needs to tell a wrong session from a wrong argument.
        const what = this.methods.get(message.id) ?? 'unknown'
        this.methods.delete(message.id)
        waiting.reject(new Error(`cdp ${what}: ${message.error.message ?? 'command failed'}`))
      }
      else { this.methods.delete(message.id); waiting.resolve(message.result ?? {}) }
      return
    }
    if (message.method === undefined) return
    const event: CdpEvent = { method: message.method, params: message.params ?? {} }
    for (const listener of this.listeners) listener(event)
  }

  /**
   * Settle every waiting call with the same failure.
   * @param reason - what ended them.
   */
  private fail(reason: Error): void {
    const waiting = [...this.pending.values()]
    this.pending.clear()
    for (const one of waiting) one.reject(reason)
  }
}

/**
 * Read the DevTools endpoint out of a browser's own stderr.
 *
 * Chrome prints `DevTools listening on ws://…` once it is ready to accept a
 * connection, and that line is the only thing that says the port is open.
 * Polling `/json/version` instead would mean guessing how long to wait and
 * retrying against a port that may not be bound yet.
 * @param chunk - one chunk of the browser's stderr.
 * @returns the endpoint, or undefined when this chunk does not carry it.
 */
export function endpointFrom(chunk: string): string | undefined {
  return /DevTools listening on (ws:\/\/\S+)/u.exec(chunk)?.[1]
}
