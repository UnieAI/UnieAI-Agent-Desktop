// @vitest-environment jsdom
/**
 * The Plugins page and its Studio MCP area as the user meets them.
 *
 * The postures that carry the design: a closed page renders nothing at all,
 * an open one is left by one gesture from anywhere on it, and the MCP area
 * says which of its four no-list states it is in — never an empty list in
 * place of a question it could not ask, and never a control it cannot honour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { PluginsPage } from '../src/client/PluginsPage.tsx'
import type { PluginsPageComponentProps } from '../src/client/contract/slots.ts'
import { PluginsNavRow } from '../src/client/PluginsNavRow.tsx'
import type { PluginsNavRowComponentProps } from '../src/client/contract/slots.ts'
import { StudioMcpArea } from '../src/client/StudioMcpArea.tsx'
import type { StudioMcpAreaComponentProps } from '../src/client/StudioMcpArea.tsx'
import type { PluginsPageState } from '../src/client/page-store.ts'
import { readStudioMcpRow } from '../src/client/studio-mcp-source.ts'
import type { StudioMcpRow, StudioMcpState } from '../src/client/studio-mcp-source.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as PluginsPageComponentProps['t']

function renderPage(open: boolean) {
  const store = createSnapshotStore<PluginsPageState>({ open })
  const close = vi.fn()
  const renderSlot = vi.fn(() => <div data-testid="area">area</div>)
  render(<PluginsPage {...({
    t, usePage: bindSnapshotSelector(store), close, renderSlot,
  } as unknown as PluginsPageComponentProps)} />)
  return { close, renderSlot }
}

function renderRow(open: boolean, wide = true) {
  const store = createSnapshotStore<PluginsPageState>({ open })
  const openPage = vi.fn()
  render(<PluginsNavRow {...({
    t, wide, usePage: bindSnapshotSelector(store), open: openPage,
  } as unknown as PluginsNavRowComponentProps)} />)
  return { openPage }
}

function renderArea(state: StudioMcpState) {
  const store = createSnapshotStore<StudioMcpState>(state)
  const refresh = vi.fn()
  render(<StudioMcpArea {...({
    t, useServers: bindSnapshotSelector(store), refresh,
  } as unknown as StudioMcpAreaComponentProps)} />)
  return { refresh }
}

const SERVER: StudioMcpRow = {
  id: 's1', label: 'Notion', origin: 'https://mcp.notion.com',
  tools: [{ name: 'search', description: '' }, { name: 'fetch', description: '' }],
}

describe('the Plugins page', () => {
  it('renders nothing while closed, so the frame below it is untouched', () => {
    const bench = renderPage(false)
    expect(document.querySelector('[data-plugins-page]')).toBeNull()
    expect(bench.renderSlot).not.toHaveBeenCalled()
  })

  it('names itself by what it is for, and mounts whatever areas were registered', () => {
    const bench = renderPage(true)
    // The proposition is the heading, not the word "Plugins". A reader arriving
    // by keyboard hears what the place is for; "Plugins" only repeats the
    // sidebar row they pressed to get here, and it stays on the page as the
    // small label beside the way back.
    expect(screen.getByRole('heading', { level: 1, name: zh['intro'] })).toBeTruthy()
    expect(screen.getByText(zh['title'])).toBeTruthy()
    // One tab renders at a time, so the page asks for its entries by id.
    expect(bench.renderSlot).toHaveBeenCalledWith('plugins.page.area', {}, { only: 'studio-mcp' })
  })

  it('shows one tab at a time and asks only for that tab’s areas', () => {
    const bench = renderPage(true)
    expect(screen.getByRole('tab', { name: zh['tab.mcp'], selected: true })).toBeTruthy()
    expect(bench.renderSlot).not.toHaveBeenCalledWith('plugins.page.area', {}, { only: 'unieai-directory' })

    fireEvent.click(screen.getByRole('tab', { name: zh['tab.directory'] }))
    expect(bench.renderSlot).toHaveBeenCalledWith('plugins.page.area', {}, { only: 'unieai-directory' })
    expect(screen.getByRole('tab', { name: zh['tab.directory'], selected: true })).toBeTruthy()
  })

  it('puts the Loader inventory and the deployment configuration under one tab', () => {
    // Both answer "what does THIS build run"; two tabs on one subject would
    // make a reader choose between them without a difference to choose on.
    const bench = renderPage(true)
    fireEvent.click(screen.getByRole('tab', { name: zh['tab.build'] }))
    expect(bench.renderSlot).toHaveBeenCalledWith('plugins.page.area', {}, { only: 'plugin-directory' })
    expect(bench.renderSlot).toHaveBeenCalledWith('plugins.page.area', {}, { only: 'cordis-plugins' })
  })

  it('leaves by the header control', () => {
    const bench = renderPage(true)
    fireEvent.click(screen.getByRole('button', { name: zh['back'] }))
    expect(bench.close).toHaveBeenCalledTimes(1)
  })

  it('leaves on Escape from anywhere on it, including inside an area', () => {
    const bench = renderPage(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(bench.close).toHaveBeenCalledTimes(1)
  })

  it('listens for nothing while closed', () => {
    const bench = renderPage(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(bench.close).not.toHaveBeenCalled()
  })

  it('takes focus when it opens, so the next Tab is not in a hidden column', () => {
    renderPage(true)
    expect(document.activeElement).toBe(document.querySelector('[data-plugins-page]'))
  })
})

describe('the sidebar Plugins row', () => {
  it('opens the page', () => {
    const bench = renderRow(false)
    fireEvent.click(screen.getByRole('button', { name: zh['nav'] }))
    expect(bench.openPage).toHaveBeenCalledTimes(1)
  })

  it('marks itself while the reader is standing on the page', () => {
    renderRow(true)
    expect(screen.getByRole('button', { name: zh['nav'] }).getAttribute('aria-current')).toBe('page')
  })

  it('drops the label in the rail, where the row is an icon', () => {
    renderRow(false, false)
    expect(screen.queryByText(zh['nav'])).toBeNull()
    expect(screen.getByRole('button', { name: zh['nav'] })).toBeTruthy()
  })
})

describe('Studio MCP, before a list exists', () => {
  it('says it is still reading rather than showing an empty account', () => {
    renderArea({ status: 'loading' })
    expect(screen.getByText(zh['mcp.loading'])).toBeTruthy()
    expect(screen.queryByText(zh['mcp.empty'])).toBeNull()
  })

  it('explains a build with no MCP route, and offers no retry for it', () => {
    const bench = renderArea({ status: 'unsupported' })
    expect(screen.getByText(zh['mcp.unsupported'])).toBeTruthy()
    // Retrying a route that does not exist is not a gesture worth drawing.
    expect(screen.queryByRole('button', { name: zh['mcp.retry'] })).toBeNull()
    expect(bench.refresh).not.toHaveBeenCalled()
  })

  it('explains a signed-out desktop instead of an empty account', () => {
    renderArea({ status: 'signed-out' })
    expect(screen.getByText(zh['mcp.signedOut'])).toBeTruthy()
    expect(screen.queryByText(zh['mcp.empty'])).toBeNull()
  })

  it('offers a retry, not a blank list, when the host will not answer', () => {
    const bench = renderArea({ status: 'failed' })
    expect(screen.getByText(zh['mcp.unreadable'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['mcp.retry'] }))
    expect(bench.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('Studio MCP, with a list', () => {
  it('says an empty account is empty, and where to change that', () => {
    renderArea({ status: 'ready', servers: [] })
    expect(screen.getByText(zh['mcp.empty'])).toBeTruthy()
    expect(screen.getByText(zh['mcp.emptyBody'])).toBeTruthy()
    // An account with nothing connected is an answer, not a missing one.
    expect(screen.queryByText(zh['mcp.unsupported'])).toBeNull()
    expect(screen.queryByText(zh['mcp.unreadable'])).toBeNull()
  })

  it('groups the catalogue under the server, which is the only real category', () => {
    // The server is a heading with its origin beside it, not a box; the tools
    // under it are the cards. A finer grouping would have to be cut out of the
    // tool names, and a naming convention is not a taxonomy.
    renderArea({ status: 'ready', servers: [SERVER] })
    const heading = screen.getByRole('heading', { level: 3, name: 'Notion' })
    expect(heading).toBeTruthy()
    expect(screen.getByText('https://mcp.notion.com')).toBeTruthy()
    const grid = screen.getByRole('list', { name: zh['mcp.toolsTitle'] })
    expect(grid.closest('section')).toBe(heading.closest('section'))
  })

  it('gives every tool a card of its own, however long the catalogue runs', () => {
    // A cap turned "what does this server give me" into a count. Seven is the
    // Studio server's real catalogue size; nothing here is allowed to elide.
    const tools = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      .map(name => ({ name, description: '' }))
    renderArea({ status: 'ready', servers: [{ ...SERVER, tools }] })
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    for (const tool of tools) expect(screen.getByText(tool.name)).toBeTruthy()
  })

  it('draws the host\u2019s sentence for a tool, and stops at the name without one', () => {
    // Nothing on this page writes copy about a tool. The line is the host's or
    // it is absent; there is no "no description" placeholder to invent.
    renderArea({ status: 'ready', servers: [{ ...SERVER, tools: [
      { name: 'search', description: 'Search one knowledge base.' },
      { name: 'fetch', description: '' },
    ] }] })
    expect(screen.getByText('Search one knowledge base.')).toBeTruthy()
    const bare = screen.getByText('fetch').closest('li')!
    expect(bare.textContent).toBe('fetch')
  })

  it('names an unnamed server, an unreported origin and an unreported catalogue', () => {
    renderArea({ status: 'ready', servers: [{ id: 's', label: '', origin: '', tools: [] }] })
    expect(screen.queryByRole('list', { name: zh['mcp.toolsTitle'] })).toBeNull()
    expect(screen.getByText(zh['mcp.unnamed'])).toBeTruthy()
    expect(screen.getByText(zh['mcp.originUnset'])).toBeTruthy()
    expect(screen.getByText(zh['mcp.toolsNone'])).toBeTruthy()
  })

  it('renders nothing credential-shaped, whatever the host sent', () => {
    // The wire answer carries no token and no url by design, and the row type
    // has no member for either. This asserts the same thing where it finally
    // matters: in the DOM the reader and the page's own screenshots see.
    const row = readStudioMcpRow({
      id: 's1', label: 'Notion', origin: 'https://mcp.notion.com',
      // A catalogue entry is narrowed by the same allowlist the server is, so
      // a per-tool credential has nowhere to land either.
      tools: [{ name: 'search', description: '', token: 's3cr3t', url: 'https://x/?k=s3cr3t' }],
      url: 'https://mcp.notion.com/mcp?key=s3cr3t',
      headers: { authorization: 'Bearer s3cr3t' },
      token: 's3cr3t', apiKey: 's3cr3t', bearer: 's3cr3t',
      expiresAt: '2026-08-22T19:00:00.000Z',
    })!
    renderArea({ status: 'ready', servers: [row] })
    const drawn = document.body.innerHTML
    for (const leak of ['s3cr3t', 'Bearer', 'authorization', 'token', 'apiKey', 'expiresAt', '2026-08-22']) {
      expect(drawn).not.toContain(leak)
    }
    // The origin is drawn; a path or a query on it never is.
    expect(screen.getByText('https://mcp.notion.com')).toBeTruthy()
    expect(drawn).not.toContain('/mcp?')
  })

  it('draws no install, connect, edit or delete control at all', () => {
    renderArea({ status: 'ready', servers: [SERVER] })
    // The desktop cannot honour any of them; the area says where they live.
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText(zh['mcp.readOnly'])).toBeTruthy()
  })
})
