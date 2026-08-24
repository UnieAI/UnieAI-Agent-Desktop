/**
 * The browser half of the terminal a PERSON drives.
 *
 * A terminal has two directions with very different shapes. Everything the
 * person does — open, type, resize, Ctrl-C, close — is a call and gets an
 * answer. Everything the shell does arrives whenever the shell feels like it,
 * so it comes back as host frames and is delivered here to whoever is
 * currently rendering that terminal.
 *
 * This owns no rendering and no scrollback of its own: the Host retains the
 * output (it is the only side that has it while no panel is mounted), and the
 * renderer keeps what it has painted. What this owns is the list, the
 * subscriptions, and the fact that a terminal outlives the panel showing it.
 */

import type { Context } from '@unieai/cordis'
import type { IApiClient, RpcRequest, HostFrame, TerminalSignalName, TerminalView } from '@unieai/uad-api-remotes/client'
import type { SnapshotStore } from '../contract/store.ts'
import { createSnapshotStore } from '../contract/store.ts'

/** Every terminal the Host holds, as the panel sees them. */
export interface TerminalListState {
  terminals: readonly TerminalView[]
  /** True once the first list has arrived; a panel shows nothing before it. */
  ready: boolean
}

/** What one mounted renderer is told. */
export interface TerminalSink {
  /**
   * Output arrived.
   * @param chunk - text exactly as the shell produced it.
   */
  output: (chunk: string) => void
  /**
   * The shell ended.
   * @param exitCode - platform exit code when one was reported.
   */
  exited: (exitCode: number | undefined) => void
}

/** A structured terminal failure a panel can branch on. */
export class TerminalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'TerminalError'
  }
}

/**
 * Terminals as UI consumers see them.
 *
 * Registered on the client context so a panel reaches it the same way it
 * reaches workspaces, rather than being handed an API client and asked to
 * remember which methods are loopback-pinned.
 */
export class TerminalRuntime {
  /** Every terminal the Host holds; a panel renders its tab strip from this. */
  readonly store: SnapshotStore<TerminalListState>
  private readonly sinks = new Map<string, Set<TerminalSink>>()
  private readonly writeTails = new Map<string, Promise<void>>()

  /**
   * @param ctx - client plugin context this service registers on.
   * @param api - the wire face.
   */
  constructor(ctx: Context, private readonly api: IApiClient) {
    this.store = createSnapshotStore<TerminalListState>({ terminals: [], ready: false })
    ctx.reflect.provide('panelTerminals', this, undefined)
  }

  /**
   * Open a terminal in a workspace directory.
   * @param workspaceId - workspace the terminal belongs to.
   * @param cwd - absolute directory the shell starts in; must be a registered workspace root.
   * @param cols - columns the panel currently measures.
   * @param rows - rows the panel currently measures.
   * @returns the new terminal and whatever it has already produced.
   */
  async open(workspaceId: string, cwd: string, cols: number, rows: number): Promise<{
    terminal: TerminalView
    replay: string
  }> {
    const response = await this.api.terminal.open({ workspaceId, cwd, cols, rows })
    return this.value(response.result, 'open')
  }

  /**
   * The live terminal already running for one workspace, if any.
   *
   * Newest first: if a workspace somehow holds more than one, the last one
   * opened is the one the person was last looking at.
   * @param workspaceId - the workspace to look in.
   * @returns its newest live terminal's id, or undefined.
   */
  liveIn(workspaceId: string): string | undefined {
    const { terminals } = this.store.getSnapshot()
    return [...terminals].reverse()
      .find(terminal => terminal.live && terminal.workspaceId === workspaceId)?.terminalId
  }

  /**
   * Re-read a terminal, for a panel that was closed and reopened.
   * @param terminalId - the terminal to read.
   * @returns the terminal and everything the Host still retains for it.
   */
  async replay(terminalId: string): Promise<{ terminal: TerminalView; replay: string }> {
    const response = await this.api.terminal.replay({ terminalId })
    return this.value(response.result, 'replay')
  }

  /**
   * Deliver keystrokes verbatim, in the order they were typed.
   *
   * Writes are chained per terminal rather than issued concurrently. Each one
   * is its own HTTP request, and HTTP promises nothing about the order two
   * in-flight requests complete in — typing `echo` fast enough produced `ecoh`
   * on a real shell. A terminal that reorders keystrokes is not a terminal, so
   * the ordering is enforced here, at the only place that knows a keystroke
   * belongs to the same stream as the last one.
   *
   * The chain is per terminal: two panels typing into two shells do not wait
   * on each other. A failed write does not poison the chain — the next
   * keystroke still goes — because the alternative is a terminal that stays
   * dead after one dropped packet.
   * @param terminalId - the terminal to write to.
   * @param data - text exactly as typed.
   * @returns settles once THIS write has been delivered.
   */
  async write(terminalId: string, data: string): Promise<void> {
    const tail = this.writeTails.get(terminalId) ?? Promise.resolve()
    const next = tail.then(async () => {
      const response = await this.api.terminal.write({ terminalId, data })
      this.value(response.result, 'write')
    })
    // The recorded tail swallows the rejection so the NEXT keystroke still
    // runs; the caller still sees this write's own failure through `next`.
    this.writeTails.set(terminalId, next.catch(() => {}))
    await next
  }

  /**
   * Report the panel's current size.
   * @param terminalId - the terminal to resize.
   * @param cols - columns.
   * @param rows - rows.
   */
  async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    const response = await this.api.terminal.resize({ terminalId, cols, rows })
    this.value(response.result, 'resize')
  }

  /**
   * Signal the foreground process group.
   * @param terminalId - the terminal to signal.
   * @param signal - the signal to deliver.
   */
  async signal(terminalId: string, signal: TerminalSignalName): Promise<void> {
    const response = await this.api.terminal.signal({ terminalId, signal })
    this.value(response.result, 'signal')
  }

  /**
   * End a terminal and forget it.
   * @param terminalId - the terminal to close.
   */
  async close(terminalId: string): Promise<void> {
    this.writeTails.delete(terminalId)
    const response = await this.api.terminal.close({ terminalId })
    this.value(response.result, 'close')
  }

  /**
   * Receive one terminal's traffic while a renderer is mounted.
   *
   * Returns a disposer rather than taking a lifetime, because the thing that
   * ends a subscription is a component unmounting — and the terminal itself
   * keeps running, which is the point.
   * @param terminalId - the terminal to follow.
   * @param sink - where its traffic goes.
   * @returns disposer that removes exactly this subscription.
   */
  subscribe(terminalId: string, sink: TerminalSink): () => void {
    const existing = this.sinks.get(terminalId) ?? new Set<TerminalSink>()
    existing.add(sink)
    this.sinks.set(terminalId, existing)
    return () => {
      const live = this.sinks.get(terminalId)
      if (live === undefined) return
      live.delete(sink)
      if (live.size === 0) this.sinks.delete(terminalId)
    }
  }

  /**
   * Route one host frame.
   * @param envelope - the frame as it arrived.
   */
  handleHostEnvelope(envelope: RpcRequest<HostFrame>): void {
    const frame = envelope.payload
    if (frame.type === 'terminal/output') {
      for (const sink of this.sinks.get(frame.terminalId) ?? []) sink.output(frame.chunk)
      return
    }
    if (frame.type === 'terminal/exited') {
      for (const sink of this.sinks.get(frame.terminalId) ?? []) sink.exited(frame.exitCode)
      return
    }
    if (frame.type === 'terminal/changed') {
      this.store.update((state) => {
        state.terminals = frame.terminals
        state.ready = true
      })
    }
  }

  /**
   * Re-baseline after a reconnect.
   *
   * A dropped websocket loses output that arrived while it was down, so a
   * renderer cannot simply resume: the list is re-read here, and each mounted
   * renderer re-reads its own terminal's retained output.
   */
  handleConnected(): void {
    void this.refresh()
  }

  /** Read the Host's list and publish it. */
  async refresh(): Promise<void> {
    const response = await this.api.terminal.list({})
    if (!response.result.ok) {
      // A deployment that composes no terminal service answers this way, and
      // that is not a failure state for a panel — it is an absent feature.
      this.store.update((state) => {
        state.terminals = []
        state.ready = true
      })
      return
    }
    const { terminals } = response.result.value
    this.store.update((state) => {
      state.terminals = terminals
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
    throw new TerminalError(result.error.code, `terminal.${method}: ${result.error.message}`)
  }
}

declare module '@unieai/cordis' {
  interface Context {
    panelTerminals: TerminalRuntime
  }
}
