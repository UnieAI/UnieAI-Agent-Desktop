/**
 * When the citations block reads a result, and when it stays silent.
 *
 * The parse itself is covered by `@unieai/uad-studio-kb-sources`; what is
 * this package's own is the decision to read at all — a call still running,
 * a call that failed, a tool that is not a knowledge-base tool.
 */
import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@unieai/uad-client-runtime/client'
import { resultTextOf, sourcesFor } from '../src/client/sources.ts'

/** One `kb_search` answer, as the server sends it: JSON inside a text block. */
const SEARCH = JSON.stringify({
  results: [
    { id: 'kb1:doc7:3:ab12', document: 'Handbook.pdf', page: 0, section: 'Intro', score: 0.82 },
  ],
})

/** A settled result carrying `text` parts. */
function settled(text: string, isError = false): ToolCallBlock {
  return { kind: 'tool-result', callId: 'c1', isError, content: [{ type: 'text', text }] } as unknown as ToolCallBlock
}

/** A call the model has dispatched but that has not answered yet. */
function running(): ToolCallBlock {
  return { callId: 'c1', name: 'mcp__studio__studio_kb_search', argsRaw: '{}' } as unknown as ToolCallBlock
}

describe('reading the selected call', () => {
  it('reads a namespaced MCP tool, because the server name is the deployment\'s to choose', () => {
    const sources = sourcesFor('mcp__studio__studio_kb_search', settled(SEARCH))
    expect(sources).toHaveLength(1)
    expect(sources[0]?.docName).toBe('Handbook.pdf')
  })

  it('shows nothing for a tool that carries no citations', () => {
    expect(sourcesFor('read', settled(SEARCH))).toEqual([])
  })

  it('shows nothing while the call is still running', () => {
    // There is no result yet; a block without `kind` has no content to read.
    expect(resultTextOf(running())).toBe('')
    expect(sourcesFor('mcp__studio__studio_kb_search', running())).toEqual([])
  })

  it('shows nothing for a failed call, whose text is a message rather than an answer', () => {
    expect(sourcesFor('studio_kb_search', settled(SEARCH, true))).toEqual([])
  })

  it('skips non-text content rather than stringifying it', () => {
    const block = {
      kind: 'tool-result',
      callId: 'c1',
      isError: false,
      content: [{ type: 'image', data: 'AAAA' }, { type: 'text', text: SEARCH }],
    } as unknown as ToolCallBlock
    expect(resultTextOf(block)).toBe(SEARCH)
    expect(sourcesFor('studio_kb_search', block)).toHaveLength(1)
  })
})
