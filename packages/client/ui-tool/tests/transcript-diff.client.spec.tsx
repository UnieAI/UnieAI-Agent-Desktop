// @vitest-environment jsdom
/**
 * The file mutation's diff AS IT READS IN THE TRANSCRIPT: the chat tool row's
 * own collapsed/expanded behaviour, the `+A -R` size it states while collapsed,
 * and the two states that must never show a change — running and failed. The
 * height bound that keeps a long diff inside its own scroller is a layout
 * declaration, so it is pinned in tool-row-styles.client.spec.ts instead (jsdom
 * has no layout, and its import.meta.url is not a file URL). The details panel's copy
 * of the same card, and the pure `diffCardModel` derivation, are pinned by
 * diff-card.client.spec.tsx; these assert only what the transcript adds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@unieai/uad-client-test-runtime'
import type { RunningToolCall, ToolResultNode } from '@unieai/uad-client-runtime/client'
import type { ToolCallView, ToolResultView } from '@unieai/uad-api-remotes/client'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import { zh } from '@unieai/uad-client-ui-conversation/src/client/locales.ts'
import { diffSummarySuffix } from '@unieai/uad-client-ui-conversation/client'
import { FileMutationRow } from '../src/client/tool/toolviews/file-mutation-row.tsx'
import { GenericToolCard, type GenericToolCardProps } from '../src/client/tool/toolviews/GenericToolCard.tsx'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

/** FileMutationRow's full prop shape (ToolRow runtime share + conversation locale seat). */
type FileMutationRowProps = Parameters<typeof FileMutationRow>[0]

const ARGS = '{"file_path":"notes/demo.txt","old_string":"one\\ntwo","new_string":"one\\ntwo\\nthree"}'

/** Two removed lines and three added ones, so `+3 -2` is not a symmetric fixture. */
const HUNK = { path: 'notes/demo.txt', oldText: 'one\ntwo', newText: 'one\ntwo\nthree' }

const callDiff = (): ToolCallView => ({ card: 'diff', title: 'Edit notes/demo.txt', diffs: [HUNK] })
const resultDiff = (): ToolResultView => ({ card: 'diff', title: 'Edit notes/demo.txt', diffs: [HUNK] })

const running = (over?: Partial<RunningToolCall>): RunningToolCall => ({
  callId: 'c1', name: 'edit', argsRaw: ARGS,
  turn: 1, step: 1, time: 1_000, callView: callDiff(), subCalls: [], ...over,
})

const settled = (over?: Partial<ToolResultNode>): ToolResultNode => ({
  kind: 'tool-result', seq: 10, time: 2_000, callId: 'c1',
  call: { name: 'edit', argsRaw: ARGS },
  callTime: 1_000,
  content: [{ type: 'text', text: 'The file notes/demo.txt has been updated successfully.' }], isError: false,
  callView: callDiff(), resultView: resultDiff(), subCalls: [], ...over,
})

const rowProps = (block: RunningToolCall | ToolResultNode): FileMutationRowProps => ({
  callId: 'c1', toolName: 'edit', block, openFile: vi.fn(), cwd: '/w/app', t,
} as unknown as FileMutationRowProps)

/** The whole summary row is the expand toggle (ToolRow's unified interaction). */
const toggleRow = (view: { container: HTMLElement }) => {
  fireEvent.click(view.container.querySelector('[data-expandable]')!)
}

/**
 * The diff card's changed rows, as their SOURCE text. The gutters and the
 * `+`/`-` marker are chrome the primitive owns and pins itself; a transcript
 * test asserts which lines changed, not how the columns are drawn.
 */
const lines = (view: { container: HTMLElement }, kind: 'add' | 'del') =>
  [...view.container.querySelectorAll(`[data-diff] [class*="_${kind}_"]`)]
    .map(node => node.querySelector('[class*="_text_"]')?.textContent ?? '')

describe('transcript diff row', () => {
  it('is collapsed by default and expands in place to the added and removed lines', () => {
    const view = render(<FileMutationRow {...rowProps(settled())} />)
    // Collapsed: no card in the DOM at all, so a long diff costs the flow nothing.
    expect(view.container.querySelector('[data-diff]')).toBeNull()
    toggleRow(view)
    // Expanding does not navigate or open the panel — the card lands in the row.
    expect(view.container.querySelector('[data-diff]')).not.toBeNull()
    // `one` and `two` are unchanged, so they read as context; the change is
    // the appended line alone. The old card drew every line on both sides.
    expect(lines(view, 'del')).toEqual([])
    expect(lines(view, 'add')).toEqual(['three'])
    // Collapsing again restores the one-line row.
    toggleRow(view)
    expect(view.container.querySelector('[data-diff]')).toBeNull()
  })

  it('states the change size beside the file name while collapsed', () => {
    // The counts are of CHANGED lines: this fixture appends one line to a
    // two-line file, so it is +1 -0. It used to read +3 -2, because the card
    // counted every line of both sides.
    const view = render(<FileMutationRow {...rowProps(settled())} />)
    // The file name is the summary; the counts are the suffix that survives
    // truncation, so a reader sizes the change without expanding.
    expect(view.getByRole('button', { name: 'notes/demo.txt' })).toBeTruthy()
    expect(view.getByText('+1 -0')).toBeTruthy()
  })

  it('keeps the collapsed counts and the card footer in agreement', () => {
    const view = render(<FileMutationRow {...rowProps(settled())} />)
    toggleRow(view)
    expect(view.getByText('+1 -0')).toBeTruthy()
    expect(view.getByText('└ +1 -0 · 1 file')).toBeTruthy()
  })

  it('reads as running and shows only the intended change, never a partial one', () => {
    const view = render(<FileMutationRow {...rowProps(running())} />)
    // The StateDot and the sweep are colour-only, so the row must say it too.
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull()
    expect(view.getByText('运行中')).toBeTruthy()
    toggleRow(view)
    // The call view carries the whole intended hunk; a half of it never renders.
    expect(lines(view, 'add')).toEqual(['three'])
  })

  it('shows no diff, no counts, and no expander when the call carries no view yet', () => {
    // A running mutation whose tool declared no call-time diff has nothing
    // applied and nothing intended to draw, so the row is not even expandable —
    // an expander onto an empty body would read as a diff still loading.
    const view = render(<FileMutationRow {...rowProps(running({ callView: null }))} />)
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull()
    expect(view.container.querySelector('[data-expandable]')).toBeNull()
    expect(view.container.querySelector('[data-diff]')).toBeNull()
    expect(view.queryByText(/^\+\d+ -\d+$/)).toBeNull()
  })

  it('reads as failed, with the failure line instead of a diff or counts', () => {
    // write/edit return no diff on isError, so the settled result view is
    // generic: the row must not fall back to the call-time hunk, which was
    // never applied.
    const view = render(<FileMutationRow {...rowProps(settled({
      isError: true, resultView: { card: 'generic' },
      content: [{ type: 'text', text: 'old_string not found in notes/demo.txt' }],
    }))} />)
    expect(view.container.querySelector('[data-state="error"]')).not.toBeNull()
    expect(view.getByText('失败')).toBeTruthy()
    expect(view.container.querySelector('[data-diff]')).toBeNull()
    expect(view.queryByText('+3 -2')).toBeNull()
    expect(view.getByText('old_string not found in notes/demo.txt')).toBeTruthy()
    toggleRow(view)
    expect(view.container.querySelector('[data-diff]')).toBeNull()
  })

  it('gives a mutation tool with no keyed row the same inline diff and counts', () => {
    // str_replace_editor's create/str_replace declare the diff card but own no
    // keyed toolview, so the transcript's fallback row must render it.
    const hunk = { path: 'notes/new.txt', oldText: null, newText: 'alpha\nbeta' }
    const props: GenericToolCardProps = {
      callId: 'c2', toolName: 'str_replace_editor', openFile: vi.fn(), t,
      block: settled({
        callId: 'c2',
        call: { name: 'str_replace_editor', argsRaw: '{"command":"create","path":"notes/new.txt"}' },
        callView: { card: 'diff', title: 'create notes/new.txt', diffs: [hunk] },
        resultView: { card: 'diff', title: 'create notes/new.txt', diffs: [hunk] },
      }),
    }
    const view = render(<GenericToolCard {...props} />)
    expect(view.getByText('+2 -0')).toBeTruthy()
    toggleRow(view)
    expect(lines(view, 'add')).toEqual(['alpha', 'beta'])
    expect(lines(view, 'del')).toEqual([])
  })

  it('leaves a non-diff row without a summary suffix', () => {
    expect(diffSummarySuffix(null, t)).toBeNull()
  })
})
