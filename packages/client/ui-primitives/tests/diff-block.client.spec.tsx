// @vitest-environment jsdom
// DiffBlock: the per-file hunk rows (path header, `@@` coordinates, context /
// removed / added lines with their old and new line numbers), the
// `+A -R · N file(s)` footer and
// its singular/plural, the head/tail height cap and its expand control, the
// empty-diffs null render, and the copy control writing the prefixed diff text
// on both the accepted and the refused clipboard paths. writeClipboard's own
// return contract is pinned in terminal-block.spec.tsx (the shared return contract), so
// only its DOM consequence is asserted here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_DIFF_MAX_LINES, DiffBlock, type DiffHunk } from '../src/index.ts'

afterEach(cleanup)

beforeEach(() => {
  vi.useRealTimers()
})

/** The rendered body rows, one string per visible line (CSS-module class prefix). */
function bodyRows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class*="_line_"]')].map(row => row.textContent ?? '')
}

/**
 * Only the changed rows (add/del), as their SOURCE text — the gutters and the
 * marker are chrome and are asserted separately.
 */
function changeRows(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[class*="_del_"], [class*="_add_"]')]
    .map(row => row.querySelector('[class*="_text_"]')?.textContent ?? '')
}

/** One changed row's two gutters, as `old|new` with a blank for an absent side. */
function gutters(row: Element): string {
  return [...row.querySelectorAll('[class*="_gutter_"]')].map(cell => cell.textContent ?? '').join('|')
}

/** `count` numbered added lines as one hunk's newText. */
function added(count: number): string {
  return Array.from({ length: count }, (_v, i) => `line ${i + 1}`).join('\n')
}

describe('DiffBlock structure', () => {
  it('renders a create as a path header and an added block (no removed side)', () => {
    const diffs: DiffHunk[] = [{ path: 'notes/new.txt', oldText: null, newText: 'hello\nworld' }]
    const { container } = render(<DiffBlock diffs={diffs} />)
    expect(screen.getByText('notes/new.txt')).toBeTruthy()
    // No removed rows: both change lines are added, numbered on the new side
    // only — a created file has no old side to place them on.
    expect(changeRows(container)).toEqual(['hello', 'world'])
    expect(container.querySelectorAll('[class*="_del_"]').length).toBe(0)
    const adds = [...container.querySelectorAll('[class*="_add_"]')]
    expect(adds).toHaveLength(2)
    expect(adds.map(gutters)).toEqual(['|1', '|2'])
  })

  it('renders an edit as the removed line then the added one, each numbered on its own side', () => {
    const diffs: DiffHunk[] = [{ path: 'a.ts', oldText: 'old', newText: 'new' }]
    const { container } = render(<DiffBlock diffs={diffs} />)
    expect(container.querySelectorAll('[class*="_del_"]').length).toBe(1)
    expect(container.querySelectorAll('[class*="_add_"]').length).toBe(1)
    expect(changeRows(container)).toEqual(['old', 'new'])
    expect(gutters(container.querySelector('[class*="_del_"]')!)).toBe('1|')
    expect(gutters(container.querySelector('[class*="_add_"]')!)).toBe('|1')
  })

  it('keeps unchanged lines as context instead of drawing them on both sides', () => {
    // The whole reason for a real diff: an edit inside a region used to print
    // every surrounding line once in red and once in green.
    const before = 'a\nb\nc\nd\ne\nf\ng'
    const { container } = render(<DiffBlock diffs={[{ path: 'a.ts', oldText: before, newText: before.replace('d', 'D') }]} />)
    expect(changeRows(container)).toEqual(['d', 'D'])
    expect(container.querySelectorAll('[class*="_context_"]').length).toBeGreaterThan(0)
    expect(screen.getByText('└ +1 -1 · 1 file')).toBeTruthy()
  })

  it('states where in the file a change lands', () => {
    const before = Array.from({ length: 40 }, (_v, i) => `line ${String(i + 1)}`).join('\n')
    const { container } = render(<DiffBlock diffs={[{ path: 'a.ts', oldText: before, newText: before.replace('line 30', 'CHANGED') }]} />)
    const hunk = container.querySelector('[class*="_hunk_"]')?.textContent ?? ''
    expect(hunk).toMatch(/^@@ -27,\d+ \+27,\d+ @@$/u)
  })

  it('opens a same-file second hunk with its own coordinates, not a repeated path', () => {
    const diffs: DiffHunk[] = [
      { path: 'a.ts', oldText: 'x', newText: 'y' },
      { path: 'a.ts', oldText: 'p', newText: 'q' },
    ]
    const { container } = render(<DiffBlock diffs={diffs} />)
    expect(container.querySelectorAll('[class*="_path_"]').length).toBe(1)
    // Each hunk states where it lands, which is what the `⋯` separator could
    // never say.
    expect(container.querySelectorAll('[class*="_hunk_"]').length).toBe(2)
  })

  it('opens a new file with its own path header', () => {
    const diffs: DiffHunk[] = [
      { path: 'a.ts', oldText: 'x', newText: 'y' },
      { path: 'b.ts', oldText: 'p', newText: 'q' },
    ]
    const { container } = render(<DiffBlock diffs={diffs} />)
    expect(container.querySelectorAll('[class*="_path_"]').length).toBe(2)
  })

  it('renders nothing for empty diffs', () => {
    const { container } = render(<DiffBlock diffs={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('treats a trailing newline as a terminator, not an extra blank line', () => {
    // A create whose newText ends in a newline is one added line, not two, and
    // the footer counts one — the phantom `+ ` empty line the naive split drew.
    const { container } = render(<DiffBlock diffs={[{ path: 'n.txt', oldText: null, newText: 'hello\n' }]} />)
    expect(changeRows(container)).toEqual(['hello'])
    expect(screen.getByText('└ +1 -0 · 1 file')).toBeTruthy()
  })

  it('renders a full deletion as removed-only with no phantom added line', () => {
    // newText '' is zero added lines: an empty string must contribute nothing.
    const { container } = render(<DiffBlock diffs={[{ path: 'gone.ts', oldText: 'a\nb', newText: '' }]} />)
    expect(container.querySelectorAll('[class*="_add_"]').length).toBe(0)
    expect(screen.getByText('└ +0 -2 · 1 file')).toBeTruthy()
  })

  it('keeps a genuine interior blank line', () => {
    const { container } = render(<DiffBlock diffs={[{ path: 'a.ts', oldText: null, newText: 'x\n\ny' }]} />)
    expect(container.querySelectorAll('[class*="_add_"]').length).toBe(3)
  })
})

describe('DiffBlock footer', () => {
  it('counts added and removed lines and one file', () => {
    const diffs: DiffHunk[] = [{ path: 'a.ts', oldText: 'a\nb', newText: 'c' }]
    render(<DiffBlock diffs={diffs} />)
    expect(screen.getByText('└ +1 -2 · 1 file')).toBeTruthy()
  })

  it('pluralizes the distinct-file count', () => {
    const diffs: DiffHunk[] = [
      { path: 'a.ts', oldText: null, newText: 'x' },
      { path: 'b.ts', oldText: null, newText: 'y' },
    ]
    render(<DiffBlock diffs={diffs} />)
    expect(screen.getByText('└ +2 -0 · 2 files')).toBeTruthy()
  })
})

describe('DiffBlock height cap', () => {
  it('shows head and tail with an expand control past the cap, then all lines expanded', () => {
    // One added line over the default cap forces the collapse.
    const diffs: DiffHunk[] = [{ path: 'a.ts', oldText: null, newText: added(DEFAULT_DIFF_MAX_LINES) }]
    // The path header counts as a row, so a body of maxLines added lines plus
    // the header is one over the cap.
    const { container } = render(<DiffBlock diffs={diffs} />)
    const toggle = screen.getByRole('button', { name: /展开其余/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // Collapsed shows fewer rows than the full body.
    const collapsedCount = bodyRows(container).length
    expect(collapsedCount).toBeLessThan(DEFAULT_DIFF_MAX_LINES + 1)
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: '收起差异' }).getAttribute('aria-expanded')).toBe('true')
    expect(bodyRows(container).length).toBeGreaterThan(collapsedCount)
  })

  it('shows no expand control at or under the cap', () => {
    const diffs: DiffHunk[] = [{ path: 'a.ts', oldText: null, newText: added(4) }]
    render(<DiffBlock diffs={diffs} maxLines={16} />)
    expect(screen.queryByRole('button', { name: /展开其余|收起差异/ })).toBeNull()
  })
})

describe('DiffBlock copy', () => {
  it('copies the prefixed diff text and flips the label on success', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const diffs: DiffHunk[] = [
      { path: 'a.ts', oldText: 'old', newText: 'new' },
      { path: 'a.ts', oldText: 'p', newText: 'q' },
    ]
    render(<DiffBlock diffs={diffs} />)
    const copy = screen.getByRole('button', { name: '复制' })
    await act(async () => { fireEvent.click(copy) })
    // What comes off the clipboard is a real unified diff: the path header,
    // each hunk's coordinates, and unpadded `-`/`+` prefixes.
    expect(writeText).toHaveBeenCalledWith(
      'a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n@@ -1,1 +1,1 @@\n-p\n+q')
    expect(screen.getByRole('button', { name: '复制成功' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
  })

  it('keeps the label on a refused clipboard write', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<DiffBlock diffs={[{ path: 'a.ts', oldText: null, newText: 'x' }]} />)
    const copy = screen.getByRole('button', { name: '复制' })
    await act(async () => { fireEvent.click(copy) })
    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
  })

  it('ignores a second click while the copied label is showing', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<DiffBlock diffs={[{ path: 'a.ts', oldText: null, newText: 'x' }]} />)
    const copy = screen.getByRole('button', { name: '复制' })
    await act(async () => { fireEvent.click(copy) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制成功' })) })
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
