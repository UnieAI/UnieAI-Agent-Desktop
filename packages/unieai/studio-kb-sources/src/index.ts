/**
 * Knowledge-base citations from Studio's MCP tools.
 *
 * Studio answers a tool call with a plain text block — no `structuredContent`,
 * no `_meta` — so the citations it knows about travel as JSON inside that
 * text. This package reads them, and nothing else: no service, no
 * registration, no network. A surface that wants to show sources calls
 * {@link kbSourcesOf} with the tool name and the text it already has.
 *
 * WHY READ, RATHER THAN ASK THE SERVER FOR STRUCTURE. The shape is the
 * product's, and it is not ours to change from here; a reader that fails
 * loudly on an unexpected payload would turn every Studio release into a
 * broken desktop. So every arm of the parse answers "no citations" rather
 * than throwing, and the tests pin the shapes it does understand.
 *
 * @module @unieai/uad-studio-kb-sources
 */

export { documentRefOf, kbSourcesOf, readerFor } from './parse.ts'
export type { KbSource } from './parse.ts'
