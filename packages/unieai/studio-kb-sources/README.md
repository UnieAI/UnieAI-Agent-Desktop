# @unieai/uad-studio-kb-sources

English | [中文](README.zh.md)

Reads knowledge-base citations out of Studio's MCP tool results — the document, page, section, score and evidence id behind an answer — so a surface can show where the answer came from.

It is a pure reader: no service, no registration, no network, no state. A caller that already holds a tool's name and its text calls `kbSourcesOf(name, text)` and gets rows, or an empty list.

## Why this is a parser and not a field read

Studio's MCP server answers a tool call with one plain text block. There is no `structuredContent`, no `_meta`, no annotations — so every citation it knows about travels as JSON *inside* that text, wrapped in up to three envelopes: a JSON-RPC error, an MCP `isError` result, then the tool's own payload. Reading a field would be the better design; it is not the design that exists, and this package is the single place that knows so.

The shape belongs to the product and can change without this repository being told. Every arm therefore answers "no citations" rather than throwing: a reader that failed loudly on an unexpected payload would turn a Studio release into a broken desktop. What pins the shapes it *does* understand is the test file, not a schema.

## The two tools disagree about page numbers

`kb_search` reports the raw zero-based page index. `kb_grep` has already added one. Normalising both to one-based happens here, once, because the alternative is an off-by-one that appears **only on grep results** — search keeps looking right while grep is one page off, and a citation that points at the wrong page is read as a search-quality problem rather than as arithmetic.

`kb_grep` also reports no ids at all, so its rows carry no evidence id and therefore no link. That is deliberate: a fabricated link is worse than an absent one.

## Getting back to the document

Studio never sends the knowledge-base id as a field. It is the first segment of the evidence id, `<kbId>:<docId>:<idx>:<digest>`, which `documentRefOf` recovers — both halves or neither, so a caller with an unusable id omits the link instead of building a broken one.

## Tool names

Matched on the SUFFIX (`kb_search`, `kb_grep`), because an MCP tool arrives namespaced by the server that offered it and a deployment chooses that prefix. The payload shape belongs to the tool, not to the naming.

## Services consumed

None. This package imports nothing from the harness at runtime.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it reads a result the model has already seen and produces rows for a person's surface.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **The text may have been replaced before this reads it.** `dsh-spill-policy`, when configured, swaps an oversized model-facing result for a preview plus a locator, and the full text then lives in the spill artifact. A caller reading citations off the model-facing text of a spilled result gets nothing; it must read the artifact, or parse before the spill. The reference product has the same hazard in a worse form — it re-derives citations from a 200-character preview on every render — which is why this package is a function a caller can invoke at whichever point still holds the whole text.
- **`kb_fetch` is not read.** It answers a document rather than a citation list, and no surface asks it for provenance yet.
- **No knowledge-base name.** The tools report the document but not the knowledge base it belongs to; a surface that wants one has to resolve `kbId` itself.
