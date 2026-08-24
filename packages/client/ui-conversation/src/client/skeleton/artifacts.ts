/**
 * What this session produced, collected from its own tool calls.
 *
 * An artifact panel answers "what came out of this conversation", and the
 * conversation already carries the answer: every file the agent wrote or edited
 * is a settled tool call with the path in its arguments. So this reads the
 * snapshot the panel is already subscribed to and derives a list — no host
 * call, no filesystem read, and nothing that can disagree with the transcript
 * beside it.
 *
 * WHY NOT READ THE FILES. The browser has no way to: `file-reference` lists
 * path candidates and returns no content, and adding a read would publish the
 * agent's whole filesystem to a page. It would also answer a different
 * question — a file's state NOW, rather than what this session did to it, which
 * is what a panel sitting beside the transcript is for.
 *
 * WRITES AND EDITS ONLY. A read is not an artifact: the session did not produce
 * it. `bash` is excluded for a harder reason — a command may write a dozen
 * files or none, and nothing in the call says which, so listing every command
 * would fill the panel with rows that promise a file and cannot name one.
 */

import type { ConversationSnapshot, ToolCallBlock } from '@unieai/uad-client-runtime/client'
import type { ChatNode } from '../contract/chat-nodes.ts'

/** Tool names that produce a file. */
const PRODUCING_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'str_replace_editor'])

/** Argument keys any of them may carry the path under. */
const PATH_KEYS = ['path', 'file_path'] as const

/** One thing the session produced. */
export interface SessionArtifact {
  /** The call it came from; the panel selects by this. */
  callId: string
  /** Turn the call belongs to, which a selection target carries. */
  turnSeq: number
  /** Path exactly as the call named it, relative or absolute. */
  path: string
  /** The tool that produced it, for the row's second line. */
  tool: string
  /** Whether the call has settled, and whether it failed. */
  state: 'running' | 'done' | 'error'
}

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
    // A streaming fragment is not yet valid JSON. The call reappears in the
    // next snapshot with complete arguments, so dropping it here costs one
    // frame and avoids a row whose path is half a string.
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
 * Collect one call and its nested calls.
 * @param block - the lifecycle to walk.
 * @param turnSeq - the turn the enclosing node belongs to.
 * @param out - accumulator, in first-seen order.
 */
function visit(block: ToolCallBlock, turnSeq: number, out: SessionArtifact[]): void {
  const settled = 'kind' in block
  const name = settled ? block.call?.name : block.name
  const argsRaw = settled ? block.call?.argsRaw : block.argsRaw
  if (name !== undefined && PRODUCING_TOOLS.has(name)) {
    const path = pathOf(argsRaw)
    if (path !== undefined) {
      out.push({
        callId: block.callId,
        turnSeq,
        path,
        tool: name,
        state: !settled ? 'running' : block.isError ? 'error' : 'done',
      })
    }
  }
  for (const child of block.subCalls) visit(child, turnSeq, out)
}

/**
 * Every artifact this session produced, newest last.
 *
 * The same path written twice appears twice on purpose: they are two acts, the
 * second may have failed, and collapsing them would hide that the last thing
 * that happened to a file was an error.
 * @param snapshot - the conversation as the panel currently sees it.
 * @returns the artifacts, in the order the session produced them.
 */
export function collectArtifacts(snapshot: ConversationSnapshot): SessionArtifact[] {
  const out: SessionArtifact[] = []
  for (const node of snapshot.chat.nodes.values()) {
    if (node.kind !== 'tool-call') continue
    const toolNode = node as ChatNode<'tool-call'>
    // A selection target carries the turn; a node the engine has not placed
    // yet reports 0, which selects nothing and is corrected on the next frame.
    const location = toolNode.location
    const turnSeq = location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : 0
    visit(toolNode.data.root, turnSeq, out)
  }
  return out
}

/**
 * The file name at the end of a path, for the row's first line.
 * @param path - the path the call named.
 * @returns the last segment, or the whole path when it has no separator.
 */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/u).filter(part => part !== '')
  return parts[parts.length - 1] ?? path
}

/**
 * Whether two collected lists describe the same artifacts.
 *
 * `collectArtifacts` derives fresh objects from every snapshot, and a
 * conversation produces a snapshot per streamed token. Comparing by reference
 * would rerender the panel on every one of them; comparing the fields the rows
 * actually display settles it in one pass over a short list.
 * @param left - one list.
 * @param right - the other.
 * @returns true when nothing the panel renders has changed.
 */
export function sameArtifacts(
  left: readonly SessionArtifact[], right: readonly SessionArtifact[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]
    return other !== undefined
      && row.callId === other.callId && row.path === other.path && row.state === other.state
  })
}
