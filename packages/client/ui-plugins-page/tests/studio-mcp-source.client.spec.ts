/**
 * The Studio MCP source, which is the honesty of this surface in code form.
 *
 * Four answers must stay four answers: a deployment that serves no MCP route
 * at all, a host holding no session, a read that failed, and an account whose
 * list is genuinely empty. Collapsing any pair of them would put "you have no
 * MCP servers" on a page that never managed to ask.
 *
 * The fifth thing asserted here is a negative: what the browser is given never
 * includes a credential, an endpoint, or the host token's expiry, whatever the
 * host chooses to send.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  readStudioMcpResponse, readStudioMcpRow, StudioMcpSource,
} from '../src/client/studio-mcp-source.ts'

/** A stub gate answering one canned response. */
function source(answer: { status?: number; body?: unknown } | 'unreachable') {
  const asked: string[] = []
  const request = (path: string): Promise<Response> => {
    asked.push(path)
    if (answer === 'unreachable') return Promise.reject(new Error('offline'))
    return Promise.resolve({
      ok: (answer.status ?? 200) < 400,
      status: answer.status ?? 200,
      json: () => Promise.resolve(answer.body),
    } as Response)
  }
  return { asked, mcp: new StudioMcpSource({ request }) }
}

describe('reading one reported server', () => {
  it('drops a row with no id, which no later answer could match', () => {
    expect(readStudioMcpRow({ label: 'Notion' })).toBeUndefined()
    expect(readStudioMcpRow('Notion')).toBeUndefined()
  })

  it('reads the four fields the wire contract publishes', () => {
    expect(readStudioMcpRow({
      id: 's1', label: 'Notion', origin: 'https://mcp.notion.com',
      tools: ['search', 'fetch'],
    })).toEqual({
      id: 's1', label: 'Notion', origin: 'https://mcp.notion.com',
      tools: [{ name: 'search', description: '' }, { name: 'fetch', description: '' }],
    })
  })

  it('carries no url, header, token or expiry — by type and by value', () => {
    // The host holds the bearer and the browser displays a listing. Every
    // field is copied by name, so a host that starts sending more reaches
    // neither the state nor the DOM until someone edits the row type.
    const row = readStudioMcpRow({
      id: 's', label: 'Notion', origin: 'https://mcp.notion.com', tools: ['search'],
      url: 'https://mcp.notion.com/mcp?key=secret',
      headers: { authorization: 'Bearer s3cret' },
      token: 's3cret', apiKey: 's3cret',
      expiresAt: '2026-08-22T19:00:00.000Z',
    })
    expect(row).toEqual({
      id: 's', label: 'Notion', origin: 'https://mcp.notion.com',
      tools: [{ name: 'search', description: '' }],
    })
    expect(Object.keys(row!)).toEqual(['id', 'label', 'origin', 'tools'])
    expect(JSON.stringify(row)).not.toContain('secret')
    expect(JSON.stringify(row)).not.toContain('expiresAt')
  })

  it('keeps a catalogue readable: real names only, each once, in reported order', () => {
    expect(readStudioMcpRow({ id: 's', tools: ['b', '', 'a', 'b', 7] })?.tools)
      .toEqual([{ name: 'b', description: '' }, { name: 'a', description: '' }])
    // A server whose catalogue was not reported has none, not an unknown.
    expect(readStudioMcpRow({ id: 's' })?.tools).toEqual([])
    expect(readStudioMcpRow({ id: 's', tools: 'search' })?.tools).toEqual([])
  })

  it('reads a described catalogue without losing the plain-name one', () => {
    // Every host build shipping today sends bare names — `/api/desktop/mcp`
    // maps `STUDIO_MCP_TOOLS` down to `tool.name` and the gate's view types the
    // field `string[]`. Both shapes have to read, or the page blanks its
    // catalogues on the release before the host starts describing them.
    expect(readStudioMcpRow({
      id: 's',
      tools: [
        { name: 'studio_kb_search', description: 'Search one knowledge base.' },
        'studio_kb_fetch',
        { description: 'nameless' },
        { name: 'studio_kb_search', description: 'a duplicate name is one tool' },
      ],
    })?.tools).toEqual([
      { name: 'studio_kb_search', description: 'Search one knowledge base.' },
      { name: 'studio_kb_fetch', description: '' },
    ])
  })

  it('narrows a catalogue entry by the same allowlist the server uses', () => {
    const tools = readStudioMcpRow({
      id: 's',
      tools: [{
        name: 'search', description: 'Search.',
        url: 'https://x/mcp?key=s3cret', token: 's3cret', headers: { authorization: 'Bearer x' },
      }],
    })?.tools
    expect(tools).toEqual([{ name: 'search', description: 'Search.' }])
    expect(Object.keys(tools![0]!)).toEqual(['name', 'description'])
    expect(JSON.stringify(tools)).not.toContain('s3cret')
  })
})

describe('reading one gate answer', () => {
  it('keeps the account states the gate distinguishes', () => {
    expect(readStudioMcpResponse({ status: 'signed-out' })).toEqual({ status: 'signed-out' })
    expect(readStudioMcpResponse({ status: 'failed' })).toEqual({ status: 'failed' })
  })

  it('refuses a body this build cannot read rather than calling it empty', () => {
    expect(readStudioMcpResponse({ status: 'signed-in' })).toBeUndefined()
    expect(readStudioMcpResponse({})).toBeUndefined()
    expect(readStudioMcpResponse('nope')).toBeUndefined()
  })

  it('recognises the listing by its servers array, envelope or not', () => {
    // The product answers `{servers: []}` and the gate wraps it; both are the
    // same answer to a reader of this page.
    expect(readStudioMcpResponse({ servers: [] })).toEqual({ status: 'ready', servers: [] })
    expect(readStudioMcpResponse({ status: 'signed-in', servers: [] }))
      .toEqual({ status: 'ready', servers: [] })
  })

  it('accepts an empty list as a real answer, not as a missing one', () => {
    const state = readStudioMcpResponse({ servers: [] })
    expect(state).toEqual({ status: 'ready', servers: [] })
    expect(state?.status).not.toBe('unsupported')
  })
})

describe('StudioMcpSource', () => {
  it('starts on loading, so nothing claims an empty account before asking', () => {
    expect(source({ body: {} }).mcp.getSnapshot()).toEqual({ status: 'loading' })
  })

  it('calls a 404 unsupported, not failed: that deployment predates the route', async () => {
    const b = source({ status: 404 })
    await b.mcp.refresh()
    expect(b.asked).toEqual(['/auth/mcp'])
    // `failed` would suggest that retrying is worth something. It is not: that
    // deployment has no MCP surface at all.
    expect(b.mcp.getSnapshot()).toEqual({ status: 'unsupported' })
  })

  it('calls a 401 signed-out, for a host that forwards the product refusal', async () => {
    const b = source({ status: 401 })
    await b.mcp.refresh()
    expect(b.mcp.getSnapshot()).toEqual({ status: 'signed-out' })
  })

  it('calls a server error a failure, which is the one a retry can fix', async () => {
    const b = source({ status: 500 })
    await b.mcp.refresh()
    expect(b.mcp.getSnapshot()).toEqual({ status: 'failed' })
  })

  it('calls an unreachable host a failure rather than throwing at the page', async () => {
    const b = source('unreachable')
    await expect(b.mcp.refresh()).resolves.toBeUndefined()
    expect(b.mcp.getSnapshot()).toEqual({ status: 'failed' })
  })

  it('publishes the list, keeping one reference while nothing moves', async () => {
    const b = source({
      body: { servers: [{ id: 's', label: 'Notion', tools: ['search'] }] },
    })
    const listener = vi.fn()
    b.mcp.subscribe(listener)
    await b.mcp.refresh()
    const first = b.mcp.getSnapshot()
    expect(first).toEqual({
      status: 'ready',
      servers: [{
        id: 's', label: 'Notion', origin: '', tools: [{ name: 'search', description: '' }],
      }],
    })

    await b.mcp.refresh()
    // uSES compares by identity: an unchanged list must not re-render the page.
    expect(b.mcp.getSnapshot()).toBe(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('republishes when only a catalogue moved, which is a change a reader sees', async () => {
    let tools: unknown[] = ['search']
    const mcp = new StudioMcpSource({
      request: () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ servers: [{ id: 's', tools }] }),
      } as Response),
    })
    await mcp.refresh()
    const first = mcp.getSnapshot()
    tools = ['search', 'create']
    await mcp.refresh()
    const second = mcp.getSnapshot()
    expect(second).not.toBe(first)

    // A description arriving for a name already listed is a change a reader
    // sees too, so it has to move the snapshot the same way a new name does.
    tools = [{ name: 'search', description: 'Search.' }, 'create']
    await mcp.refresh()
    expect(mcp.getSnapshot()).not.toBe(second)
  })

  it('stops publishing once disposed', async () => {
    const b = source({ body: { servers: [] } })
    const listener = vi.fn()
    b.mcp.subscribe(listener)
    b.mcp.dispose()
    await b.mcp.refresh()
    expect(listener).not.toHaveBeenCalled()
    expect(b.mcp.getSnapshot()).toEqual({ status: 'loading' })
  })
})
