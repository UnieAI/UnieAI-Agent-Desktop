/**
 * The store's rules: a failed read keeps the list someone can still act on,
 * one approval runs at a time, cancelling aborts the attempt without freeing
 * the slot, and a connect answer replaces exactly its own row.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorView } from '@unieai/uad-api-remotes/client'
import { createConnectorsView, INITIAL_CONNECTORS_STATE } from '../src/client/connector-view.ts'
import type { ConnectAnswer, ConnectorRoutes, ConnectorsAnswer } from '../src/client/connector-view.ts'

/** One connector row, with the fields a test cares about overridden. */
function entry(id: string, over: Partial<ConnectorView> = {}): ConnectorView {
  return { id, label: id, connected: false, scopes: [], renewable: false, requiresClientId: false, ...over }
}

/** Routes whose answers each test supplies. */
function routes(over: Partial<ConnectorRoutes> = {}): ConnectorRoutes {
  return {
    list: () => Promise.resolve({ ok: true, connectors: [] } satisfies ConnectorsAnswer),
    connect: connector => Promise.resolve({ ok: true, connector: entry(connector, { connected: true }) } satisfies ConnectAnswer),
    disconnect: () => Promise.resolve({ ok: true, connectors: [] } satisfies ConnectorsAnswer),
    ...over,
  }
}

describe('createConnectorsView', () => {
  it('starts loading, so an empty page does not read as "no connectors"', () => {
    expect(createConnectorsView(routes()).getSnapshot()).toEqual(INITIAL_CONNECTORS_STATE)
    expect(INITIAL_CONNECTORS_STATE.loading).toBe(true)
  })

  it('publishes the list and notifies subscribers, and stops on unsubscribe', async () => {
    const view = createConnectorsView(routes({ list: () => Promise.resolve({ ok: true, connectors: [entry('notion')] }) }))
    const seen = vi.fn()
    const off = view.subscribe(seen)
    await view.refresh()

    expect(view.getSnapshot().connectors).toEqual([entry('notion')])
    expect(view.getSnapshot().loading).toBe(false)
    expect(seen).toHaveBeenCalled()

    off()
    seen.mockClear()
    await view.refresh()
    expect(seen).not.toHaveBeenCalled()
  })

  it('keeps the connectors already on screen when a re-read fails', async () => {
    let answer: ConnectorsAnswer = { ok: true, connectors: [entry('notion')] }
    const view = createConnectorsView(routes({ list: () => Promise.resolve(answer) }))
    await view.refresh()

    answer = { ok: false, message: 'the host is not answering' }
    await view.refresh()

    expect(view.getSnapshot().connectors).toEqual([entry('notion')])
    expect(view.getSnapshot().error).toBe('the host is not answering')
  })

  it('replaces only the connected row, leaving every other one as it was', async () => {
    const view = createConnectorsView(routes({
      list: () => Promise.resolve({ ok: true, connectors: [entry('notion'), entry('linear')] }),
    }))
    await view.refresh()
    await view.connect('linear')

    expect(view.getSnapshot().connectors).toEqual([entry('notion'), entry('linear', { connected: true })])
    expect(view.getSnapshot().connecting).toBe('')
  })

  it('refuses a second approval while one is open, so two windows cannot race the redirect', async () => {
    const connect = vi.fn((connector: string) => new Promise<ConnectAnswer>((resolve) => {
      setTimeout(() => { resolve({ ok: true, connector: entry(connector, { connected: true }) }) }, 0)
    }))
    const view = createConnectorsView(routes({ connect }))

    const first = view.connect('notion')
    await view.connect('linear')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(view.getSnapshot().connecting).toBe('notion')

    await first
    expect(view.getSnapshot().connecting).toBe('')
  })

  it('reports a refused approval and frees the slot', async () => {
    const view = createConnectorsView(routes({
      connect: () => Promise.resolve({ ok: false, message: 'no OAuth client id is configured for google' }),
    }))
    await view.connect('google')

    expect(view.getSnapshot().error).toBe('no OAuth client id is configured for google')
    expect(view.getSnapshot().connecting).toBe('')
  })

  it('aborts the open attempt on cancel and does nothing when none is open', async () => {
    let seen: AbortSignal | undefined
    const view = createConnectorsView(routes({
      connect: (_connector, signal) => {
        seen = signal
        return new Promise<ConnectAnswer>((resolve) => {
          signal.addEventListener('abort', () => { resolve({ ok: false, message: 'cancelled' }) })
        })
      },
    }))

    // Nothing open: cancel is a no-op rather than a crash.
    view.cancel()
    expect(view.getSnapshot().connecting).toBe('')

    const running = view.connect('notion')
    view.cancel()
    await running

    expect(seen?.aborted).toBe(true)
    expect(view.getSnapshot().error).toBe('cancelled')
  })

  it('marks the row being disconnected and adopts the list the host answers with', async () => {
    const disconnect = vi.fn(() => Promise.resolve({ ok: true as const, connectors: [entry('notion')] }))
    const view = createConnectorsView(routes({
      list: () => Promise.resolve({ ok: true, connectors: [entry('notion', { connected: true })] }),
      disconnect,
    }))
    await view.refresh()

    const running = view.disconnect('notion')
    expect(view.getSnapshot().disconnecting).toBe('notion')
    await running

    expect(view.getSnapshot().disconnecting).toBe('')
    expect(view.getSnapshot().connectors).toEqual([entry('notion')])
  })

  it('reports a refused disconnect without clearing the list', async () => {
    const view = createConnectorsView(routes({
      list: () => Promise.resolve({ ok: true, connectors: [entry('notion', { connected: true })] }),
      disconnect: () => Promise.resolve({ ok: false, message: 'the credential store is read-only' }),
    }))
    await view.refresh()
    await view.disconnect('notion')

    expect(view.getSnapshot().connectors).toEqual([entry('notion', { connected: true })])
    expect(view.getSnapshot().error).toBe('the credential store is read-only')
  })

  it('dismisses a failure without re-reading anything', async () => {
    const list = vi.fn(() => Promise.resolve({ ok: false as const, message: 'nope' }))
    const view = createConnectorsView(routes({ list }))
    await view.refresh()

    view.dismissError()
    expect(view.getSnapshot().error).toBe('')
    expect(list).toHaveBeenCalledTimes(1)
  })
})
