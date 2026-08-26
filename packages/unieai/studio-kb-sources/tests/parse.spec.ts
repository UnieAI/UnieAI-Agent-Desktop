/**
 * What a Studio KB tool result yields, and what it refuses to invent.
 *
 * The payload shapes are the product's, copied from the two tools this reads:
 * `kb_search` answers `results[]` with a zero-based `page`, `kb_grep` answers
 * `matches[]` whose `page` is already one-based.
 */
import { describe, expect, it } from 'vitest'
import { documentRefOf, kbSourcesOf, readerFor } from '../src/parse.ts'

/** One `kb_search` answer, as the server sends it: JSON inside a text block. */
const SEARCH = JSON.stringify({
  results: [
    { id: 'kb1:doc7:3:ab12', document: 'Handbook.pdf', page: 0, section: 'Intro', score: 0.82 },
    { id: 'kb1:doc7:9:cd34', document: 'Handbook.pdf', page: 11, section: 'Limits', score: 0.4 },
  ],
})

/** One `kb_grep` answer. Its `page` has already been incremented upstream. */
const GREP = JSON.stringify({
  matches: [
    { document: 'Handbook.pdf', page: 1, line: 'the quoted line' },
    { document: 'Notes.md', page: null },
  ],
})

describe('which tools this reads', () => {
  it('matches on the suffix, because an MCP tool arrives namespaced', () => {
    expect(readerFor('studio_kb_search')).toBe('search')
    expect(readerFor('kb_grep')).toBe('grep')
    expect(readerFor('anything_kb_grep')).toBe('grep')
    expect(readerFor('kb_list')).toBeUndefined()
    expect(readerFor('read')).toBeUndefined()
  })
})

describe('reading citations', () => {
  it('normalizes search pages to one-based', () => {
    // Page 0 in the payload is page 1 to a reader.
    expect(kbSourcesOf('studio_kb_search', SEARCH).map(source => source.page)).toEqual([1, 12])
  })

  it('leaves grep pages alone, because they are already one-based', () => {
    // The off-by-one this guards against appears on grep results only, which
    // is why it survives so long: search looks right while grep is one off.
    expect(kbSourcesOf('studio_kb_grep', GREP).map(source => source.page)).toEqual([1, null])
  })

  it('carries the evidence id from search and nothing from grep', () => {
    // grep reports no ids, so its rows get no link rather than a fabricated one.
    expect(kbSourcesOf('studio_kb_search', SEARCH)[0]?.chunkId).toBe('kb1:doc7:3:ab12')
    expect(kbSourcesOf('studio_kb_grep', GREP)[0]?.chunkId).toBe('')
  })

  it('keeps the fields a citation is read by', () => {
    expect(kbSourcesOf('studio_kb_search', SEARCH)[0]).toEqual({
      docName: 'Handbook.pdf',
      page: 1,
      section: 'Intro',
      score: 0.82,
      chunkId: 'kb1:doc7:3:ab12',
    })
  })

  it('names an unnamed document rather than showing an empty row', () => {
    const text = JSON.stringify({ results: [{ id: 'kb1:doc1:0:aa', page: 0 }] })
    expect(kbSourcesOf('studio_kb_search', text)[0]?.docName).toBe('unnamed document')
  })
})

describe('what it refuses to invent', () => {
  it.each([
    ['prose rather than JSON', 'No documents matched your query.'],
    ['a JSON-RPC error', JSON.stringify({ error: { code: -32_000, message: 'unauthorized' } })],
    ['an MCP error result', JSON.stringify({ isError: true, content: [{ type: 'text', text: 'nope' }] })],
    ['an empty answer', ''],
    ['a payload with no rows', JSON.stringify({ results: 'not an array' })],
  ])('reports nothing for %s', (_case, text) => {
    expect(kbSourcesOf('studio_kb_search', text)).toEqual([])
  })

  it('drops a row that identifies no document at all', () => {
    const text = JSON.stringify({ results: [{ page: 4 }, { id: 'kb1:doc2:0:zz', document: 'Real.pdf', page: 0 }] })
    expect(kbSourcesOf('studio_kb_search', text).map(source => source.docName)).toEqual(['Real.pdf'])
  })

  it('unwraps a result envelope but not a tool that answers something else', () => {
    const wrapped = JSON.stringify({ result: { results: [{ id: 'k:d:0:x', document: 'A.pdf', page: 2 }] } })
    expect(kbSourcesOf('studio_kb_search', wrapped).map(source => source.page)).toEqual([3])
    expect(kbSourcesOf('studio_kb_search', JSON.stringify({ rows: [] }))).toEqual([])
  })
})

describe('linking back to the document', () => {
  it('recovers both ids from the evidence id, since Studio sends neither as a field', () => {
    expect(documentRefOf('kb1:doc7:3:ab12')).toEqual({ kbId: 'kb1', documentId: 'doc7' })
  })

  it('answers empty for an id that carries no document, so a caller omits the link', () => {
    expect(documentRefOf('')).toEqual({ kbId: '', documentId: '' })
    expect(documentRefOf('kb-only')).toEqual({ kbId: '', documentId: '' })
  })
})
