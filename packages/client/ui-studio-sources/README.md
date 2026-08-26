# @unieai/uad-client-ui-studio-sources

English | [中文](README.zh.md)

The knowledge-base citations under a Studio MCP result: which documents an answer came from, which page each passage is on, and how strongly the search matched.

## Where it appears

The details panel, under the Output of the selected call, in the per-call `conversation.details.tool.annotation` list.

An annotation rather than a tool view: the citations belong next to the result, not instead of it. The keyed `tool.call.toolview` seat cannot express this occupant at all — an MCP tool arrives as `mcp__<serverName>__<rawName>` and the server name is the deployment's to choose, so there is no key to register under. This occupant therefore sees every call a person opens and reads the name itself, rendering nothing for the calls it does not know, which is most of them.

## What it refuses to show

- **A running call.** There is no result yet.
- **A failed call.** Its text is a message, not the answer the reader understands.
- **A score the tool did not report.** An absent score is not zero, and a row showing `0%` would be a claim the server never made.

Rows are not links. The desktop cannot open a Studio document, so a row styled as a link would promise a destination that does not exist here.

## Where the reading lives

`@unieai/uad-studio-kb-sources`, which needs no host: the text is already in the browser, inside the result the person opened. That package parses; this one decides when to parse and how a row reads. It also names the nameless document, because that is a translation and the parser has no language.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it re-reads a result the model already produced and shows a person where it came from.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **No way back to the document.** Search results carry an evidence id (`<kbId>:<docId>:<idx>:<digest>`) and the desktop has nowhere to take it; when a Studio document route exists, the row becomes the link it currently declines to imitate.
- **Two of Studio's tools.** `kb_search` and `kb_grep` report citations the reader understands; `kb_fetch` and `kb_list` answer with something else and show nothing here.
- **The occupant runs for every opened call.** The list hole has no key, so recognition costs one string test per selected call — negligible, but it is the reason this is not a keyed registration.
