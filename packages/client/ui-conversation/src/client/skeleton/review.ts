/**
 * What this session changed, as one reviewable set.
 *
 * The transcript already shows each change where it happened — one diff inside
 * one tool row, read in the order the agent worked. That answers "what did it
 * just do". It does not answer "what did this conversation do to my code",
 * which is the question a person asks before they keep or throw away a
 * session's work, and answering it by scrolling back through a transcript
 * means holding twenty rows in your head.
 *
 * So this is the same material, gathered: every file the session mutated, each
 * with its applied diff, in the order the session touched them.
 *
 * ONE DERIVATION. The hunks come from `diffCardModel`, the same function the
 * tool rows use. A second reading of a change could disagree with the first,
 * and a review surface that disagrees with the transcript it summarizes is
 * worse than no review surface.
 *
 * LAST WRITE WINS, and the earlier ones are still counted. A file written
 * three times appears once, showing its most recent applied diff, with the
 * count of how many times the session touched it. The artifact list keeps every
 * act separately because it is a log; this is a review, and a reviewer wants
 * the file's state, not its history.
 */

import type { ConversationSnapshot, ToolCallBlock } from '@unieai/uad-client-runtime/client'
import type { DiffHunk, DiffStats } from '@unieai/uad-client-ui-primitives'
import { diffStats } from '@unieai/uad-client-ui-primitives'
import type { ChatNode } from '../contract/chat-nodes.ts'
import { diffCardModel } from '@unieai/uad-client-ui-primitives'

/** One file the session changed. */
export interface ReviewedFile {
  /** Path exactly as the call named it; the identity this list is keyed by. */
  path: string
  /** The call whose diff is shown — the most recent one that carried hunks. */
  callId: string
  /** Turn that call belongs to, which a selection target carries. */
  turnSeq: number
  /** The tool that made the change, which a selection target carries. */
  tool: string
  /** The applied hunks of that call. */
  diffs: DiffHunk[]
  /** Added and removed line counts across those hunks. */
  stats: DiffStats
  /** How many times the session mutated this file, including the shown one. */
  touches: number
  /** True when the most recent mutation of this file failed. */
  failed: boolean
}

/** The session's changes, plus what they add up to. */
export interface ReviewSummary {
  files: ReviewedFile[]
  /** Added and removed lines across every file. */
  total: DiffStats
}

/** Argument keys a mutating tool may carry its path under. */
const PATH_KEYS = ['path', 'file_path'] as const

/**
 * Read a path out of a call's raw arguments.
 * @param argsRaw - the call's arguments as the wire carried them.
 * @returns the path, or undefined when the arguments name none.
 */
function pathOf(argsRaw: string | null | undefined): string | undefined {
  if (argsRaw === null || argsRaw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    // A streaming fragment is not yet valid JSON; the call reappears complete.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  for (const key of PATH_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/**
 * Fold one call and its nested calls into the review.
 * @param block - the lifecycle to walk.
 * @param turnSeq - the turn the enclosing node belongs to.
 * @param into - accumulator keyed by path, in first-seen order.
 */
function visit(block: ToolCallBlock, turnSeq: number, into: Map<string, ReviewedFile>): void {
  const settled = 'kind' in block
  const argsRaw = settled ? block.call?.argsRaw : block.argsRaw
  const tool = (settled ? block.call?.name : block.name) ?? ''
  const path = pathOf(argsRaw)
  // The tool is not named here: a call carries a diff card exactly when it
  // applied a change, whatever the tool is called. Keying on the render intent
  // rather than a tool allowlist means a plugin's own mutating tool appears in
  // the review without this file learning its name.
  const diff = diffCardModel(block)
  if (path !== undefined && diff !== null) {
    const previous = into.get(path)
    into.set(path, {
      path,
      callId: block.callId,
      turnSeq,
      tool,
      diffs: diff.card.diffs,
      stats: diff.stats,
      touches: (previous?.touches ?? 0) + 1,
      failed: settled && block.isError,
    })
  }
  for (const child of block.subCalls) visit(child, turnSeq, into)
}

/**
 * Everything this session changed.
 * @param snapshot - the conversation as the panel currently sees it.
 * @returns one entry per file, in the order the session first touched it.
 */
export function collectReview(snapshot: ConversationSnapshot): ReviewSummary {
  const byPath = new Map<string, ReviewedFile>()
  for (const node of snapshot.chat.nodes.values()) {
    if (node.kind !== 'tool-call') continue
    const toolNode = node as ChatNode<'tool-call'>
    // A selection target carries the turn; a node the engine has not placed
    // yet reports 0, which selects nothing and is corrected on the next frame.
    const location = toolNode.location
    const turnSeq = location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : 0
    visit(toolNode.data.root, turnSeq, byPath)
  }
  const files = [...byPath.values()]
  // Summed from every file's own hunks rather than from the per-file stats, so
  // the footer and the cards are the same arithmetic on the same material.
  return { files, total: diffStats(files.flatMap(file => file.diffs)) }
}

/**
 * Whether two reviews describe the same changes.
 *
 * A conversation produces a snapshot per streamed token, and this derivation
 * builds fresh objects from each one. Comparing what the panel actually draws
 * settles it in one pass over a short list.
 * @param left - one review.
 * @param right - the other.
 * @returns true when nothing the panel renders has changed.
 */
export function sameReview(left: ReviewSummary, right: ReviewSummary): boolean {
  if (left.files.length !== right.files.length) return false
  if (left.total.added !== right.total.added || left.total.removed !== right.total.removed) return false
  return left.files.every((file, index) => {
    const other = right.files[index]
    return other !== undefined
      && file.path === other.path
      && file.callId === other.callId
      && file.touches === other.touches
      && file.failed === other.failed
      && file.stats.added === other.stats.added
      && file.stats.removed === other.stats.removed
  })
}
