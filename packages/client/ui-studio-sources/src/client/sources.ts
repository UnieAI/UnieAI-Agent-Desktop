/**
 * What the block says, as citations.
 *
 * The reading is `@unieai/uad-studio-kb-sources`; this module only decides
 * WHEN to read — a still-running call has no result yet, and a failed one
 * carries an error message rather than the JSON the reader understands.
 */

import { kbSourcesOf } from '@unieai/uad-studio-kb-sources'
import type { KbSource } from '@unieai/uad-studio-kb-sources'
import type { ToolCallBlock } from '@unieai/uad-client-runtime/client'

/**
 * Flatten a settled result's text parts.
 *
 * Non-text content is skipped rather than stringified: an image part is not
 * a place citations can hide, and JSON-encoding it would hand the reader a
 * document it would have to reject.
 * @param block - the selected call's frozen slice.
 * @returns the concatenated text, empty when the call is still running.
 */
export function resultTextOf(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  if (block.isError) return ''
  return block.content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map(item => item.text)
    .join('\n')
}

/**
 * Citations for one selected call, if it is a knowledge-base call at all.
 *
 * @param name - the call's wire name, `mcp__<serverName>__<rawName>` for an
 * MCP tool; the reader matches on the raw suffix because the server name is
 * the deployment's to choose.
 * @param block - the selected call's frozen slice.
 * @returns the cited passages, empty for every other tool.
 */
export function sourcesFor(name: string, block: ToolCallBlock): KbSource[] {
  const text = resultTextOf(block)
  if (text === '') return []
  return kbSourcesOf(name, text)
}
