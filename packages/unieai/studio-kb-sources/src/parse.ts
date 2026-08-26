/**
 * Read knowledge-base citations out of a Studio MCP tool result.
 *
 * Studio's MCP server answers with a plain text block and nothing else — no
 * `structuredContent`, no `_meta`, no annotations — so every citation it knows
 * about travels as JSON INSIDE that text, wrapped in up to three envelopes
 * (a JSON-RPC error, an MCP `isError` result, then the tool's own payload).
 * This module is the one place that knows that, and it is pure so the shapes
 * can be tested without a server.
 */

/** One cited passage, as a reader needs it. */
export interface KbSource {
  /** Human document name; never empty (an unnamed document says so). */
  docName: string
  /** Page number, ONE-BASED, or null when the tool reports none. */
  page: number | null
  /** Section heading, when the tool reports one. */
  section: string
  /** Relevance score in 0..1, or null when the tool reports none. */
  score: number | null
  /**
   * Evidence id, `<kbId>:<docId>:<idx>:<digest>`.
   *
   * Empty for a tool that reports none. It is the only way back to the
   * document, so a row without one carries no link rather than a guessed one.
   */
  chunkId: string
}

/** Tool-name suffixes this module can read, and how each numbers its pages. */
const READERS: Readonly<Record<string, 'search' | 'grep'>> = {
  kb_search: 'search',
  kb_grep: 'grep',
}

/**
 * Which reader a tool name selects, if any.
 *
 * Matched on the SUFFIX because an MCP tool arrives namespaced by the server
 * that offered it (`studio_kb_search`, or a prefix a deployment chose), and
 * the payload shape belongs to the tool, not to the naming.
 * @param toolName - the tool as the registry knows it.
 * @returns the reader kind, or undefined for a tool this module ignores.
 */
export function readerFor(toolName: string): 'search' | 'grep' | undefined {
  for (const [suffix, kind] of Object.entries(READERS)) {
    if (toolName === suffix || toolName.endsWith(`_${suffix}`)) return kind
  }
  return undefined
}

/**
 * The tool's own payload, unwrapped from however many envelopes it arrived in.
 * @param text - the text block's contents.
 * @returns the parsed payload, or undefined when it is not JSON this can read.
 */
function payloadOf(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Not JSON at all: a human-readable error, or a tool that answers prose.
    // Reporting nothing is right — inventing a citation would be worse.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const envelope = parsed as Record<string, unknown>
  // A JSON-RPC error or an MCP error carries no citations, only a reason.
  if ('error' in envelope) return undefined
  if (envelope['isError'] === true) return undefined
  const inner = envelope['result']
  if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
    return inner as Record<string, unknown>
  }
  return envelope
}

/**
 * A string field, or `''`.
 * @param value - the raw field.
 * @returns the string, trimmed of nothing, or empty.
 */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * A finite number field, or null.
 * @param value - the raw field.
 * @returns the number, or null.
 */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Read every citation a Studio KB tool result carries.
 *
 * THE TWO TOOLS DISAGREE ABOUT PAGE NUMBERING and this is the whole reason
 * page normalization happens here rather than at each call site: `kb_search`
 * reports the raw zero-based index, `kb_grep` has already added one. An
 * off-by-one that only appears on grep results is exactly the kind of bug that
 * reaches a reader as "the citation points at the wrong page" and is blamed on
 * the search engine.
 * @param toolName - the tool that produced the result.
 * @param text - the result's text block.
 * @returns citations in the order the tool reported them; empty when there are none.
 */
export function kbSourcesOf(toolName: string, text: string): KbSource[] {
  const reader = readerFor(toolName)
  if (reader === undefined) return []
  const payload = payloadOf(text)
  if (payload === undefined) return []

  const rows = reader === 'search' ? payload['results'] : payload['matches']
  if (!Array.isArray(rows)) return []

  const sources: KbSource[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    const docName = str(record['document'])
    const chunkId = reader === 'search' ? str(record['id']) : ''
    if (docName === '' && chunkId === '') continue
    const page = num(record['page'])
    sources.push({
      docName: docName === '' ? 'unnamed document' : docName,
      // Search is zero-based; grep already counted from one.
      page: page === null ? null : reader === 'search' ? page + 1 : page,
      section: reader === 'search' ? str(record['section']) : '',
      score: reader === 'search' ? num(record['score']) : null,
      chunkId,
    })
  }
  return sources
}

/**
 * The knowledge-base id inside an evidence id.
 *
 * Studio never sends the knowledge-base id as a field; it is the first segment
 * of `<kbId>:<docId>:<idx>:<digest>`, and a link back to the document needs
 * both it and the document id.
 * @param chunkId - the evidence id.
 * @returns `{ kbId, documentId }`, either empty when the id does not carry it.
 */
export function documentRefOf(chunkId: string): { kbId: string; documentId: string } {
  const parts = chunkId.split(':')
  if (parts.length < 2) return { kbId: '', documentId: '' }
  return { kbId: parts[0] ?? '', documentId: parts[1] ?? '' }
}
