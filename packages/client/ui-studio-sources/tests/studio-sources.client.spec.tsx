// @vitest-environment jsdom
/**
 * What a person sees under a knowledge-base result: one row per citation,
 * carrying the document, the page it is on, and how well it matched — and
 * nothing at all under any other tool.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ToolCallBlock } from '@unieai/uad-client-runtime/client'
import { StudioSources } from '../src/client/StudioSources.tsx'
import type { StudioSourcesProps } from '../src/client/StudioSources.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** One `kb_search` answer with a named and an unnamed document. */
const SEARCH = JSON.stringify({
  results: [
    { id: 'kb1:doc7:3:ab12', document: 'Handbook.pdf', page: 0, section: 'Intro', score: 0.82 },
    { id: 'kb1:doc9:1:ef56', document: '', page: 4, section: '', score: null },
  ],
})

/** The dictionary the framework would inject, interpolation included. */
const t = ((key: keyof typeof en, params?: Record<string, number | string>) =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))) as StudioSourcesProps['t']

function settled(text: string): ToolCallBlock {
  return { kind: 'tool-result', callId: 'c1', isError: false, content: [{ type: 'text', text }] } as unknown as ToolCallBlock
}

function mount(name: string, block: ToolCallBlock) {
  return render(<StudioSources {...({ t, name, block } as unknown as StudioSourcesProps)} />)
}

describe('the citations block', () => {
  it('draws one row per citation, with the page a reader would cite', () => {
    mount('mcp__studio__studio_kb_search', settled(SEARCH))
    expect(screen.getByText(en.title)).toBeDefined()
    expect(screen.getByText('Handbook.pdf')).toBeDefined()
    // Page 0 in the payload is page 1 to a reader.
    expect(screen.getByText('p. 1')).toBeDefined()
    expect(screen.getByText('Relevance 82%')).toBeDefined()
  })

  it('names a document the tool did not name, rather than showing a blank row', () => {
    mount('studio_kb_search', settled(SEARCH))
    expect(screen.getByText(en.unnamed)).toBeDefined()
  })

  it('omits a score the tool did not report instead of showing zero', () => {
    mount('studio_kb_search', settled(SEARCH))
    expect(screen.queryByText('Relevance 0%')).toBeNull()
  })

  it('renders nothing under a tool that carries no citations', () => {
    const { container } = mount('read', settled(SEARCH))
    expect(container.innerHTML).toBe('')
  })
})
