/**
 * What the stored list admits, and what it refuses.
 *
 * The rules are asserted here rather than through a mounted plugin because
 * that is where they decide anything: a row that reaches `mount` has already
 * been accepted, and a row that never should have is invisible by then.
 */

import { describe, expect, it } from 'vitest'
import { differs, mountable, problemsWith, type McpServerEntry } from '../src/settings.ts'

const entry = (over: Partial<McpServerEntry> = {}): McpServerEntry => ({
  name: 'notion', url: 'https://mcp.example.test/sse', token: '', enabled: true, ...over,
})

describe('what a row must say to be mountable', () => {
  it('accepts a complete row', () => {
    expect(problemsWith(entry(), [])).toEqual([])
  })

  it('reports every fault at once, not the first', () => {
    // A form that surfaces one problem per attempt makes someone fix three
    // things in three round trips.
    expect(problemsWith(entry({ name: '', url: '' }), [])).toEqual(['name.missing', 'url.missing'])
  })

  it('holds the name to what a tool prefix can be', () => {
    // `mcp-client` publishes `mcp__<name>__<tool>`, so the name is a
    // model-facing identifier and not a label.
    expect(problemsWith(entry({ name: 'my notion' }), [])).toEqual(['name.shape'])
    expect(problemsWith(entry({ name: 'a'.repeat(33) }), [])).toEqual(['name.shape'])
    expect(problemsWith(entry({ name: 'a-b_C9' }), [])).toEqual([])
  })

  it('refuses a name another row already took', () => {
    expect(problemsWith(entry({ name: 'notion' }), ['notion'])).toEqual(['name.duplicate'])
  })

  it('accepts http as well as https', () => {
    // A server on loopback is the ordinary case; refusing it would push people
    // towards a proxy that adds nothing.
    expect(problemsWith(entry({ url: 'http://127.0.0.1:8931/mcp' }), [])).toEqual([])
  })

  it('refuses a scheme that is not a fetchable endpoint', () => {
    expect(problemsWith(entry({ url: 'ftp://example.test' }), [])).toEqual(['url.scheme'])
    expect(problemsWith(entry({ url: 'mcp.example.test' }), [])).toEqual(['url.scheme'])
  })
})

describe('which rows are actually mounted', () => {
  it('skips a disabled row without dropping it from the list', () => {
    expect(mountable([entry({ name: 'a' }), entry({ name: 'b', enabled: false })])
      .map(row => row.name)).toEqual(['a'])
  })

  it('skips an unfinished row and mounts the rest', () => {
    // The list is a working document. One row someone is still typing must not
    // stop the ones that are ready.
    const rows = [entry({ name: 'ready' }), entry({ name: '', url: '' }), entry({ name: 'also' })]
    expect(mountable(rows).map(row => row.name)).toEqual(['ready', 'also'])
  })

  it('keeps the first of two rows claiming one name', () => {
    const rows = [entry({ name: 'dup', url: 'https://first.test' }), entry({ name: 'dup', url: 'https://second.test' })]
    expect(mountable(rows).map(row => row.url)).toEqual(['https://first.test'])
  })

  it('trims what it hands to the transport', () => {
    const [row] = mountable([entry({ name: '  notion  ', url: '  https://x.test/sse  ' })])
    expect(row).toMatchObject({ name: 'notion', url: 'https://x.test/sse' })
  })
})

describe('when a change requires remounting', () => {
  it('ignores a change the transport cannot be told about', () => {
    expect(differs([entry()], [entry({ enabled: true })])).toBe(false)
  })

  it('notices a moved endpoint or a new token', () => {
    expect(differs([entry()], [entry({ url: 'https://moved.test' })])).toBe(true)
    expect(differs([entry()], [entry({ token: 'secret' })])).toBe(true)
  })
})
