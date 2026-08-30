// @vitest-environment jsdom
/**
 * The section as rendered: each connector's one sentence, the button that is
 * offered for each state, the waiting notice that replaces nothing but adds
 * the way out, and the two states with no list to show.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConnectorView } from '@unieai/uad-api-remotes/client'
import { ConnectorsSection, expiryDay } from '../src/client/ConnectorsSection.tsx'
import type { ConnectorsSectionProps } from '../src/client/ConnectorsSection.tsx'
import type { ConnectorsState } from '../src/client/connector-view.ts'
import { en, type ConnectorsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Translate with the English dictionary, interpolating `{name}` holes. */
const t = ((key: ConnectorsLocaleKey, params?: Record<string, string>) =>
  en[key].replace(/\{(\w+)\}/gu, (whole, name: string) =>
    params?.[name] ?? whole)) as ConnectorsSectionProps['t']

/** One connector row. */
function entry(id: string, over: Partial<ConnectorView> = {}): ConnectorView {
  return { id, label: id, connected: false, scopes: [], renewable: false, requiresClientId: false, ...over }
}

/** Section props over a fixed state snapshot. */
function props(
  state: Partial<ConnectorsState>,
  overrides: Partial<ConnectorsSectionProps> = {},
): ConnectorsSectionProps {
  const snapshot: ConnectorsState = {
    connectors: [], loading: false, connecting: '', disconnecting: '', error: '', ...state,
  }
  return {
    t,
    useConnectors: (selector: (value: ConnectorsState) => unknown) => selector(snapshot),
    refresh: () => {},
    locale: () => 'en-US',
    connect: () => {},
    cancel: () => {},
    disconnect: () => {},
    dismissError: () => {},
    close: () => {},
    ...overrides,
  } as ConnectorsSectionProps
}

describe('expiryDay', () => {
  it('states the day, because nobody plans around the hour', () => {
    expect(expiryDay('2026-09-30T14:37:00.000Z', 'en-US')).toBe('Sep 30, 2026')
  })

  it('answers an unparseable instant with itself rather than "Invalid Date"', () => {
    expect(expiryDay('whenever', 'en-US')).toBe('whenever')
  })
})

describe('ConnectorsSection', () => {
  it('reads the list once when it opens, and not again on re-render', () => {
    // The registration's `inject` builds a fresh face on every render, so the
    // effect's dependency changes each time and the ref is what stops a
    // second read.
    const refresh = vi.fn()
    const { rerender } = render(<ConnectorsSection {...props({}, { refresh: () => { refresh() } })} />)
    rerender(<ConnectorsSection {...props({}, { refresh: () => { refresh() } })} />)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('says it is reading rather than showing an empty list', () => {
    render(<ConnectorsSection {...props({ loading: true })} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(screen.queryByText(en['empty.title'])).toBeNull()
  })

  it('says a build with no connectors has none, once the read has settled', () => {
    render(<ConnectorsSection {...props({ connectors: [] })} />)
    expect(screen.getByText(en['empty.title'])).toBeTruthy()
  })

  it('offers Connect for a disconnected connector and reports the click', () => {
    const connect = vi.fn()
    render(<ConnectorsSection {...props({ connectors: [entry('notion')] }, { connect })} />)

    expect(screen.getByText(en['state.disconnected'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['action.connect'] }))
    expect(connect).toHaveBeenCalledWith('notion')
  })

  it('names the account a connection was approved by', () => {
    render(<ConnectorsSection {...props({
      connectors: [entry('google', { connected: true, account: 'someone@example.com', renewable: true })],
    })} />)
    expect(screen.getByText('Connected · someone@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: en['action.disconnect'] })).toBeTruthy()
  })

  it('states when a connection that cannot renew stops working', () => {
    render(<ConnectorsSection {...props({
      connectors: [entry('sanity', { connected: true, renewable: false, expiresAt: '2026-09-30T00:00:00.000Z' })],
    })} />)
    expect(screen.getByText('Good until Sep 30, 2026, then asks again')).toBeTruthy()
  })

  it('says "Connected" with no account and no expiry to report', () => {
    render(<ConnectorsSection {...props({ connectors: [entry('linear', { connected: true, renewable: true })] })} />)
    expect(screen.getByText(en['state.connected'])).toBeTruthy()
  })

  it('will not offer a button that can only fail, and explains why instead', () => {
    render(<ConnectorsSection {...props({ connectors: [entry('google', { requiresClientId: true })] })} />)

    expect(screen.getByText(en['state.needsSetup'])).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en['action.connect'] }).disabled).toBe(true)
    expect(screen.getByText(en['setup.title'])).toBeTruthy()
  })

  it('holds every other Connect while one approval is open, and offers the way out', () => {
    const cancel = vi.fn()
    render(<ConnectorsSection {...props({
      connectors: [entry('notion'), entry('linear')], connecting: 'notion',
    }, { cancel })} />)

    expect(screen.getByText('We opened the notion sign-in page. Say yes over there and this finishes on its own.')).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: en['action.connect'] })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    fireEvent.click(screen.getByRole('button', { name: en['action.cancel'] }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('holds the row being disconnected without holding the others', () => {
    const disconnect = vi.fn()
    render(<ConnectorsSection {...props({
      connectors: [entry('notion', { connected: true }), entry('linear', { connected: true })],
      disconnecting: 'notion',
    }, { disconnect })} />)

    const buttons = screen.getAllByRole('button', { name: en['action.disconnect'] }) as HTMLButtonElement[]
    expect(buttons[0]?.disabled).toBe(true)
    expect(buttons[1]?.disabled).toBe(false)
    fireEvent.click(buttons[1]!)
    expect(disconnect).toHaveBeenCalledWith('linear')
  })

  it('shows a failure in the host’s own words and lets it be dismissed', () => {
    const dismissError = vi.fn()
    render(<ConnectorsSection {...props({ error: 'the provider refused' }, { dismissError })} />)

    expect(screen.getByRole('alert').textContent).toContain('the provider refused')
    fireEvent.click(screen.getByRole('button', { name: en['action.dismiss'] }))
    expect(dismissError).toHaveBeenCalledOnce()
  })
})
