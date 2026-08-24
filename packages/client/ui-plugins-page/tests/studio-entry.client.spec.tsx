// @vitest-environment jsdom
/**
 * The first-party UnieAI Studio entry as the reader meets it.
 *
 * The postures that carry the design: the entry exists in every reading, but
 * everything it SAYS is read — bound and unbound are decided by whether the
 * account's own `/auth/mcp` listing carries the Studio server, the tools it
 * advertises are the ones that listing reported, and the bind action appears
 * for exactly the one reading that can honour it and points at the product
 * page that performs the binding.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@unieai/uad-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import { StudioEntry } from '../src/client/StudioEntry.tsx'
import type { StudioEntryComponentProps } from '../src/client/StudioEntry.tsx'
import {
  STUDIO_BINDING_URL, STUDIO_ICON, STUDIO_MCP_SERVER_ID, readStudioBinding,
} from '../src/client/studio-entry.ts'
import type { StudioMcpRow, StudioMcpState } from '../src/client/studio-mcp-source.ts'
import { en, ja, zh, zhTW } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as StudioEntryComponentProps['t']

/** One listed server with every field a test does not care about filled in. */
function server(overrides: Partial<StudioMcpRow> & { id: string }): StudioMcpRow {
  return {
    label: 'UnieAI Studio',
    origin: 'https://agent.unieai.com',
    tools: [],
    ...overrides,
  }
}

function renderEntry(state: StudioMcpState) {
  const store = createSnapshotStore<StudioMcpState>(state)
  const refresh = vi.fn()
  render(<StudioEntry {...({
    t, useServers: bindSnapshotSelector(store), refresh,
  } as unknown as StudioEntryComponentProps)} />)
  return { refresh }
}

const READY = (servers: readonly StudioMcpRow[]): StudioMcpState => ({ status: 'ready', servers })

const STUDIO = server({
  id: STUDIO_MCP_SERVER_ID,
  tools: [{ name: 'studio_search', description: '' }, { name: 'studio_sql', description: '' }],
})

describe('the Studio entry, bound', () => {
  it('reads as connected and names the tools the binding actually reported', () => {
    renderEntry(READY([STUDIO]))
    expect(screen.getByText(zh['studio.bound'])).toBeTruthy()
    expect(screen.getByText(zh['studio.boundBody'])).toBeTruthy()
    expect(screen.getByText('studio_search')).toBeTruthy()
    expect(screen.getByText('studio_sql')).toBeTruthy()
  })

  it('offers no bind action, because the account already holds the link', () => {
    renderEntry(READY([STUDIO]))
    expect(screen.queryByRole('link', { name: zh['studio.bind'] })).toBeNull()
  })

  it('says a bound server reported no tools rather than drawing an empty strip', () => {
    renderEntry(READY([server({ id: STUDIO_MCP_SERVER_ID })]))
    expect(screen.getByText(zh['studio.bound'])).toBeTruthy()
    expect(screen.getByText(zh['mcp.toolsNone'])).toBeTruthy()
  })

  it('reads the account’s own server, not another one in the same listing', () => {
    renderEntry(READY([server({ id: 'notion', tools: [{ name: 'search', description: '' }] }), STUDIO]))
    expect(screen.getByText('studio_search')).toBeTruthy()
    expect(screen.queryByText('search')).toBeNull()
  })
})

describe('the Studio entry, unbound', () => {
  it('offers the bind action for a settled listing with no Studio server in it', () => {
    renderEntry(READY([]))
    expect(screen.getByRole('link', { name: zh['studio.bind'] })).toBeTruthy()
    expect(screen.getByText(zh['studio.unbound'])).toBeTruthy()
    expect(screen.queryByText(zh['studio.bound'])).toBeNull()
  })

  it('sends the reader to the product page that performs the binding', () => {
    // The product runs the whole device grant on its own settings page, whose
    // Profile tab holds the binding card and is deep-linked by hash. Nothing
    // else on this desktop can perform or start the link.
    renderEntry(READY([]))
    const link = screen.getByRole('link', { name: zh['studio.bind'] })
    expect(link.getAttribute('href')).toBe(STUDIO_BINDING_URL)
    expect(STUDIO_BINDING_URL).toBe('https://agent.unieai.com/settings#profile')
  })

  it('opens that page beside the desktop rather than navigating away from it', () => {
    // The grant is approved on the product and polled there; a desktop that
    // navigated away would lose the surface the reader returns to.
    renderEntry(READY([]))
    const link = screen.getByRole('link', { name: zh['studio.bind'] })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('reads a listing that carries only other servers as unbound, not as bound', () => {
    renderEntry(READY([server({ id: 'notion' })]))
    expect(screen.getByRole('link', { name: zh['studio.bind'] })).toBeTruthy()
  })
})

describe('the Studio entry, with no account to ask about', () => {
  it('asks for a sign-in instead of offering a bind that would land on a login', () => {
    renderEntry({ status: 'signed-out' })
    expect(screen.getByText(zh['studio.signedOut'])).toBeTruthy()
    expect(screen.queryByRole('link', { name: zh['studio.bind'] })).toBeNull()
    expect(screen.queryByText(zh['studio.bound'])).toBeNull()
    expect(screen.queryByText(zh['studio.unbound'])).toBeNull()
  })

  it('says it is still reading rather than showing an unbound account', () => {
    renderEntry({ status: 'loading' })
    expect(screen.getByText(zh['studio.loading'])).toBeTruthy()
    expect(screen.queryByRole('link', { name: zh['studio.bind'] })).toBeNull()
  })

  it('explains a deployment that serves no MCP route, and offers no retry for it', () => {
    const bench = renderEntry({ status: 'unsupported' })
    expect(screen.getByText(zh['studio.unsupported'])).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(bench.refresh).not.toHaveBeenCalled()
  })

  it('offers a retry, not a binding claim, when the host will not answer', () => {
    const bench = renderEntry({ status: 'failed' })
    expect(screen.getByText(zh['studio.failed'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['mcp.retry'] }))
    expect(bench.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('the entry’s fixed parts', () => {
  it('draws the mark from the inlined image, so it survives an offline desktop', () => {
    renderEntry(READY([]))
    const mark = screen.getByAltText(zh['studio.iconAlt'])
    expect(mark.getAttribute('src')).toBe(STUDIO_ICON)
    expect(STUDIO_ICON.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('names the product in every shipped locale, untranslated', () => {
    for (const dict of [zh, zhTW, ja, en]) expect(dict['studio.name']).toBe('UnieAI Studio')
  })

  it('carries a bind verb in every shipped locale', () => {
    expect(zhTW['studio.bind']).toBe('綁定')
    for (const dict of [zh, zhTW, ja, en]) expect(dict['studio.bind']).not.toBe('')
  })
})

describe('readStudioBinding', () => {
  it('matches the product’s server id exactly, never by prefix', () => {
    expect(readStudioBinding(READY([server({ id: 'unieai-studio-staging' })])).status).toBe('unbound')
    expect(readStudioBinding(READY([STUDIO])).status).toBe('bound')
  })

  it('keeps every reading that carries no listing under its own name', () => {
    for (const status of ['loading', 'signed-out', 'unsupported', 'failed'] as const) {
      expect(readStudioBinding({ status }).status).toBe(status)
    }
  })

  it('hands the bound reading the row the product sent', () => {
    const binding = readStudioBinding(READY([STUDIO]))
    expect(binding.status === 'bound' ? binding.server : undefined).toBe(STUDIO)
  })
})
