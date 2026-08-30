/**
 * What the Connections page knows: which services can be connected, which are,
 * and whether an approval is currently waiting on the person.
 *
 * The list is fetched, not watched. A grant changes only when someone presses
 * a button on this page or withdraws access at the provider, and neither of
 * those is something the host pushes; reading on open is both simpler and
 * fresher than a cache.
 *
 * An approval is the one long gesture here. It runs in the person's own
 * browser — a window this page does not control and cannot see — so the state
 * a surface renders is "waiting for you over there", and the only thing this
 * page can offer while it waits is to stop waiting.
 */

import type { ConnectorView } from '@unieai/uad-api-remotes/client'

/** What the page renders from. */
export interface ConnectorsState {
  /** Every connector this deployment offers; empty until the first read finishes. */
  connectors: ConnectorView[]
  /** True until the first read settles, so an empty page does not read as "none". */
  loading: boolean
  /** Id of the connector whose approval is open in a browser window, or `''`. */
  connecting: string
  /** Id of the connector being disconnected, or `''`. */
  disconnecting: string
  /** What went wrong, in the host's own words. */
  error: string
}

/** A snapshot store the page binds to. */
export interface ConnectorsView {
  getSnapshot(): ConnectorsState
  subscribe(listener: () => void): () => void
}

/** What a list-shaped call answers with. */
export type ConnectorsAnswer =
  | { ok: true; connectors: ConnectorView[] }
  | { ok: false; message: string }

/** What a connect answers with: the one connector as it now stands, or why not. */
export type ConnectAnswer =
  | { ok: true; connector: ConnectorView }
  | { ok: false; message: string }

/** What the view needs from the host. */
export interface ConnectorRoutes {
  /** Read every connector and its state. */
  list(): Promise<ConnectorsAnswer>
  /**
   * Run one provider's approval, settling when the grant is stored.
   * @param connector - the provider id.
   * @param signal - abandons the attempt when the person stops waiting.
   */
  connect(connector: string, signal: AbortSignal): Promise<ConnectAnswer>
  /** Forget one provider's grant, answering with the list as it now stands. */
  disconnect(connector: string): Promise<ConnectorsAnswer>
}

/** The state a page starts from, before anything has been read. */
export const INITIAL_CONNECTORS_STATE: ConnectorsState = {
  connectors: [],
  loading: true,
  connecting: '',
  disconnecting: '',
  error: '',
}

/** The gestures the page offers on top of the store. */
export interface ConnectorsActions {
  /** Read the connector list; called when the page opens. */
  refresh(): Promise<void>
  /** Approve one connector, which opens the provider's page in a browser. */
  connect(connector: string): Promise<void>
  /** Stop waiting for an approval that is open. */
  cancel(): void
  /** Forget one connector's grant. */
  disconnect(connector: string): Promise<void>
  /** Dismiss the current failure without re-reading anything. */
  dismissError(): void
}

/**
 * Build the view.
 * @param routes - the host calls this view makes.
 * @returns a store plus the gestures the page offers.
 */
export function createConnectorsView(routes: ConnectorRoutes): ConnectorsView & ConnectorsActions {
  let state = INITIAL_CONNECTORS_STATE
  const listeners = new Set<() => void>()
  /** The open approval's controller; `undefined` whenever none is waiting. */
  let attempt: AbortController | undefined

  const publish = (next: Partial<ConnectorsState>): void => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const applyList = (answer: ConnectorsAnswer): void => {
    // The previous list is kept on failure: a page that still shows the
    // connectors can still disconnect one, which is often the way out.
    if (answer.ok) publish({ connectors: answer.connectors, loading: false, error: '' })
    else publish({ loading: false, error: answer.message })
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: async () => {
      publish({ error: '' })
      applyList(await routes.list())
    },
    connect: async (connector) => {
      // One approval at a time: two open browser windows would race for the
      // same loopback redirect, and the second would fail for a reason
      // nobody could act on.
      if (state.connecting !== '') return
      const controller = new AbortController()
      attempt = controller
      publish({ connecting: connector, error: '' })
      const answer = await routes.connect(connector, controller.signal)
      attempt = undefined
      if (!answer.ok) {
        publish({ connecting: '', error: answer.message })
        return
      }
      const connected = answer.connector
      publish({
        connecting: '',
        error: '',
        connectors: state.connectors.map(entry => entry.id === connected.id ? connected : entry),
      })
    },
    cancel: () => {
      if (attempt === undefined) return
      attempt.abort()
      // `connecting` is left for the connect call to clear: it is still
      // running, and clearing it here would let a second approval start
      // while the first is unwinding.
    },
    disconnect: async (connector) => {
      publish({ disconnecting: connector, error: '' })
      const answer = await routes.disconnect(connector)
      publish({ disconnecting: '' })
      applyList(answer)
    },
    dismissError: () => { publish({ error: '' }) },
  }
}
