/**
 * What the Review tab gathers, and what it refuses to.
 */

import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot, ToolCallBlock } from '@unieai/uad-client-runtime/client'
import { collectReview, sameReview } from '../src/client/skeleton/review.ts'

/** A diff view as the wire delivers it. */
const view = (path: string, oldText: string | null, newText: string) =>
  ({ card: 'diff', diffs: [{ path, oldText, newText }] })

/** A settled mutation carrying its applied hunks. */
const applied = (
  callId: string, path: string, oldText: string | null, newText: string,
  over: Partial<{ isError: boolean; subCalls: ToolCallBlock[] }> = {},
): ToolCallBlock => ({
  kind: 'result', callId,
  call: { name: 'edit', argsRaw: JSON.stringify({ path }) },
  resultView: view(path, oldText, newText),
  isError: over.isError ?? false, content: [], subCalls: over.subCalls ?? [],
} as unknown as ToolCallBlock)

/** A settled call with no diff card — the generic path. */
const plain = (callId: string, name: string, args: unknown): ToolCallBlock => ({
  kind: 'result', callId, call: { name, argsRaw: JSON.stringify(args) },
  isError: false, content: [], subCalls: [],
} as unknown as ToolCallBlock)

/** A running call carrying its intended diff. */
const running = (callId: string, path: string, newText: string): ToolCallBlock => ({
  callId, name: 'write', argsRaw: JSON.stringify({ path }),
  callView: view(path, null, newText), subCalls: [],
} as unknown as ToolCallBlock)

/** A snapshot holding one tool node per root block. */
const snapshotOf = (...roots: ToolCallBlock[]): ConversationSnapshot => ({
  chat: {
    nodes: new Map(roots.map((root, index) => [`k${String(index)}`, {
      kind: 'tool-call', data: { root }, location: { kind: 'turn', turn: { turn: 1 } },
    }])),
  },
} as unknown as ConversationSnapshot)

describe('what the session changed', () => {
  it('gathers one entry per file, in the order the session first touched it', () => {
    const { files } = collectReview(snapshotOf(
      applied('c1', 'src/a.ts', 'one\n', 'two\n'),
      applied('c2', 'src/b.ts', null, 'new\n'),
    ))
    expect(files.map(file => file.path)).toEqual(['src/a.ts', 'src/b.ts'])
    expect(files[0]).toMatchObject({ callId: 'c1', touches: 1, failed: false })
  })

  it('shows the last write of a file and counts the earlier ones', () => {
    // A reviewer wants the file's state, not its history; the count is what
    // keeps the earlier acts from vanishing silently.
    const { files } = collectReview(snapshotOf(
      applied('c1', 'src/a.ts', 'one\n', 'two\n'),
      applied('c2', 'src/a.ts', 'two\n', 'three\n'),
    ))
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ callId: 'c2', touches: 2 })
  })

  it('keys on the diff card, not on a tool allowlist', () => {
    // A plugin's own mutating tool appears here without this file learning its
    // name; a call with no diff card does not, whatever it is called.
    const { files } = collectReview(snapshotOf(
      plain('c1', 'read', { path: 'src/a.ts' }),
      plain('c2', 'bash', { command: 'tee out.txt' }),
    ))
    expect(files).toEqual([])
  })

  it('finds a change nested inside another call', () => {
    const { files } = collectReview(snapshotOf(
      plain('outer', 'run_code', {}),
    ))
    expect(files).toEqual([])
    const nested = collectReview(snapshotOf({
      ...plain('outer', 'run_code', {}),
      subCalls: [applied('inner', 'deep.ts', null, 'x\n')],
    }))
    expect(nested.files.map(file => file.callId)).toEqual(['inner'])
  })

  it('keeps a failed mutation, marked, rather than dropping it', () => {
    // Its intended change still renders; the mark is what stops a diff card
    // from reading as applied.
    const { files } = collectReview(snapshotOf(
      applied('c1', 'src/a.ts', 'one\n', 'two\n', { isError: true }),
    ))
    expect(files[0]).toMatchObject({ failed: true })
  })

  it('shows a running change before it settles', () => {
    const { files } = collectReview(snapshotOf(running('c1', 'src/a.ts', 'draft\n')))
    expect(files.map(file => file.path)).toEqual(['src/a.ts'])
  })

  it('totals the same hunks the cards draw', () => {
    const review = collectReview(snapshotOf(
      applied('c1', 'a.ts', null, 'x\ny\n'),
      applied('c2', 'b.ts', 'p\n', ''),
    ))
    const summed = review.files.reduce(
      (acc, file) => ({ added: acc.added + file.stats.added, removed: acc.removed + file.stats.removed }),
      { added: 0, removed: 0 })
    expect({ added: review.total.added, removed: review.total.removed }).toEqual(summed)
    // The footer counts files too, and counts the ones it drew.
    expect(review.total.files).toBe(review.files.length)
  })
})

describe('sameReview', () => {
  it('settles a re-derivation of unchanged material', () => {
    const snapshot = snapshotOf(applied('c1', 'a.ts', 'one\n', 'two\n'))
    expect(sameReview(collectReview(snapshot), collectReview(snapshot))).toBe(true)
  })

  it('notices a new file, a new call for the same file, and a failure', () => {
    const one = collectReview(snapshotOf(applied('c1', 'a.ts', 'one\n', 'two\n')))
    expect(sameReview(one, collectReview(snapshotOf(
      applied('c1', 'a.ts', 'one\n', 'two\n'), applied('c2', 'b.ts', null, 'x\n'),
    )))).toBe(false)
    expect(sameReview(one, collectReview(snapshotOf(
      applied('c1', 'a.ts', 'one\n', 'two\n'), applied('c2', 'a.ts', 'two\n', 'three\n'),
    )))).toBe(false)
    expect(sameReview(one, collectReview(snapshotOf(
      applied('c1', 'a.ts', 'one\n', 'two\n', { isError: true }),
    )))).toBe(false)
  })
})
