/**
 * What the right-hand panel calls an artifact, and what it refuses to.
 */

import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot, ToolCallBlock } from '@unieai/uad-client-runtime/client'
import { collectArtifacts, fileName, sameArtifacts } from '../src/client/skeleton/artifacts.ts'

/** A settled call, optionally with nested dispatches. */
const settled = (
  callId: string, name: string, args: unknown, over: Partial<{ isError: boolean; subCalls: ToolCallBlock[] }> = {},
): ToolCallBlock => ({
  kind: 'result', callId, call: { name, argsRaw: JSON.stringify(args) },
  isError: over.isError ?? false, content: [], subCalls: over.subCalls ?? [],
} as unknown as ToolCallBlock)

/** A call still in flight. */
const running = (callId: string, name: string, argsRaw: string): ToolCallBlock =>
  ({ callId, name, argsRaw, subCalls: [] } as unknown as ToolCallBlock)

/** A snapshot holding one tool node per root block, all in one turn. */
const snapshotOf = (...roots: ToolCallBlock[]): ConversationSnapshot => ({
  chat: {
    nodes: new Map(roots.map((root, index) => [`k${String(index)}`, {
      kind: 'tool-call',
      data: { root },
      location: { kind: 'turn', turn: { turn: 7 } },
    }])),
  },
} as unknown as ConversationSnapshot)

describe('what the session produced', () => {
  it('takes a write and an edit, with the path the call named', () => {
    const rows = collectArtifacts(snapshotOf(
      settled('c1', 'write', { path: 'src/a.ts' }),
      settled('c2', 'edit', { file_path: '/abs/b.ts' }),
    ))
    expect(rows.map(row => row.path)).toEqual(['src/a.ts', '/abs/b.ts'])
    expect(rows[0]).toMatchObject({ callId: 'c1', tool: 'write', state: 'done', turnSeq: 7 })
  })

  it('refuses a read, which the session did not produce', () => {
    expect(collectArtifacts(snapshotOf(settled('c1', 'read', { path: 'src/a.ts' })))).toEqual([])
  })

  it('refuses bash, which may write a dozen files or none and names neither', () => {
    // Listing every command would fill the panel with rows that promise a file
    // and cannot name one.
    expect(collectArtifacts(snapshotOf(settled('c1', 'bash', { command: 'tee out.txt' })))).toEqual([])
  })

  it('finds a write nested inside another call', () => {
    const rows = collectArtifacts(snapshotOf(
      settled('outer', 'run_code', {}, { subCalls: [settled('inner', 'write', { path: 'deep.ts' })] }),
    ))
    expect(rows.map(row => row.callId)).toEqual(['inner'])
  })

  it('reports a failed write as failed rather than dropping it', () => {
    const rows = collectArtifacts(snapshotOf(settled('c1', 'write', { path: 'a.ts' }, { isError: true })))
    expect(rows[0]?.state).toBe('error')
  })

  it('shows a write that has not settled as running', () => {
    expect(collectArtifacts(snapshotOf(running('c1', 'write', '{"path":"a.ts"}')))[0]?.state).toBe('running')
  })

  it('waits out a streaming fragment rather than showing half a path', () => {
    // The call reappears with complete arguments in the next snapshot.
    expect(collectArtifacts(snapshotOf(running('c1', 'write', '{"path":"src/'))).length).toBe(0)
  })

  it('skips a call whose arguments name no path', () => {
    expect(collectArtifacts(snapshotOf(settled('c1', 'write', { content: 'x' })))).toEqual([])
  })

  it('keeps the same path written twice, because they are two acts', () => {
    // Collapsing them would hide that the last thing that happened to a file
    // was an error.
    const rows = collectArtifacts(snapshotOf(
      settled('c1', 'write', { path: 'a.ts' }),
      settled('c2', 'write', { path: 'a.ts' }, { isError: true }),
    ))
    expect(rows.map(row => row.state)).toEqual(['done', 'error'])
  })

  it('reports turn 0 for a node the engine has not placed', () => {
    const snapshot = {
      chat: { nodes: new Map([['k', {
        kind: 'tool-call', data: { root: settled('c1', 'write', { path: 'a.ts' }) },
        location: { kind: 'unresolved' },
      }]]) },
    } as unknown as ConversationSnapshot
    expect(collectArtifacts(snapshot)[0]?.turnSeq).toBe(0)
  })

  it('ignores a node that is not a tool call', () => {
    const snapshot = {
      chat: { nodes: new Map([['k', { kind: 'assistant', data: {} }]]) },
    } as unknown as ConversationSnapshot
    expect(collectArtifacts(snapshot)).toEqual([])
  })
})

describe('rerendering only when the list changed', () => {
  const one = [{ callId: 'c1', turnSeq: 1, path: 'a.ts', tool: 'write', state: 'done' as const }]

  it('holds across the fresh objects every snapshot produces', () => {
    // A conversation produces a snapshot per streamed token; comparing by
    // reference would rerender the panel on every one.
    expect(sameArtifacts(one, [{ ...one[0]! }])).toBe(true)
  })

  it('notices a settled write, a new row, and a removed one', () => {
    expect(sameArtifacts(one, [{ ...one[0]!, state: 'error' }])).toBe(false)
    expect(sameArtifacts(one, [...one, { ...one[0]!, callId: 'c2' }])).toBe(false)
    expect(sameArtifacts(one, [])).toBe(false)
  })
})

describe('the name a row leads with', () => {
  it('is the last segment, on either separator', () => {
    expect(fileName('src/deep/a.ts')).toBe('a.ts')
    expect(fileName('C:\\src\\a.ts')).toBe('a.ts')
  })

  it('falls back to the whole path when there is no segment', () => {
    expect(fileName('a.ts')).toBe('a.ts')
    expect(fileName('/')).toBe('/')
  })
})
