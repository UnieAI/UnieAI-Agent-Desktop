# Agent Note: the details column as a tab container

Status: implemented

English | [中文](2026-08-25-details-column-as-tab-container.zh.md)

## Problem

The right-hand column was one selected tool call. It opened only as a side effect of clicking a tool row in the transcript, and opening one replaced the whole column — so everything the column could answer on its own was unreachable, and there was no way back except closing it.

That shape hid two things worth having. The session already knows every file it wrote: each is a settled tool call with the path in its arguments. And the workspace is a directory the Host can list. Neither needed new data; both needed somewhere to live.

## Decision

The column is a tab container. Every open thing is a tab — the workspace tree, one file, what this session produced, one selected tool call — and `+` offers the same menu the empty column shows.

**The selected call is a tab like the others**, but its selection stays in the shared chat store because the transcript writes it too. A second path to the same fact would let the two disagree about what is open.

**Files are read through two bounded Host operations**, not one general one. `host.listWorkspaceEntries` returns names; `host.readWorkspaceFile` returns text. Both take a `root` the workspace registry already holds and refuse a path that resolves outside it, checked with `relative()` rather than a string prefix — `/w/project-secrets` starts with `/w/project` and is not inside it. The read is bounded twice more: a size the deployment sets, checked BEFORE the read so the bound keeps bytes off the wire, and a NUL-byte test that withholds binary rather than rendering replacement characters.

**There is no write counterpart.** Reading publishes the workspace to a page; writing would let the page change it. That is a separate decision with its own fence.

**The viewer reuses the read tool's token runs, not its card.** `highlightLines` already existed for line-numbered views. `ReadBlock` was tried first and brought its banner, language label and copy control into a surface that already has a breadcrumb header — chrome over chrome.

**The file-open control is withheld unless the page is served from loopback.** `openFile` reaches the operating system of the HOST. Over loopback that is the reader's own machine; served to another machine it opens a file on someone else's desktop, silently. An action whose effect the presser cannot observe is worse than an absent one.

## Alternatives considered

**Keep the panel as a selected call and add a second surface for files.** Rejected: two columns competing for the same width, and the same "no way back" problem in each.

**One general `host.readFile`.** Rejected: the fence is what makes publishing file content defensible, and a general operation has no root to fence against.

**Serve the tree from `directoryPicker.browse`.** Already exposed to the browser, and rejected: its `entries` are directories only, because it exists to pick a workspace — it reaches anywhere the Host account can read, which is exactly the reach this surface must not have.

## Consequences

The empty column now answers rather than instructing. A long path scrolls in its own track while the controls stay put. A cut listing says it was cut instead of implying it was complete.

The column's ceiling is a drag clamp, not a limit: maximizing leaves the concession chain entirely, giving the center zero width, because a floor is what this state exists to leave behind.
