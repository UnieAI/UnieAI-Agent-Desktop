# Agent Note: a document belongs in the right column, not over the conversation

Status: implemented

English | [中文](2026-08-29-a-document-in-the-right-column.zh.md)

## Problem

Univer Office brings spreadsheets, docs and slides into the harness through `dsh-univer-office`, and it renders them in **floating windows** dragged over the conversation. That is a reasonable default for a plugin that cannot assume a shell, and the wrong one for this product: an office document is where the work happens for as long as it is open, and a window that covers the transcript makes the person choose between reading what the agent said and looking at what it produced.

The shell already had a right column, and it was spoken for. `details` is a single-occupant frame slot held by ui-conversation's DetailsPanel, and its width collapses to zero whenever no session is current — both correct for tool details, which belong to a session and are read in passing.

## Decision

**One right column, two possible occupants, and the layout decides which.**

`ui-layout` declares a `document` slot beside `details` and renders whichever the store says is showing. `ctx.layout.openDocument()` claims the column and opens it; `closeDocument()` returns it to details and closes it. A document is `session-maybe` and keeps the column open with no session current, because a document outlives the turn that produced it — the session-gating rule that is right for details would close a viewer mid-edit.

Two columns side by side was the alternative. On a laptop that leaves neither usable, and the request was for a sidebar, singular.

**Opening a document owns the column; closing it gives the column back.** Not a tab strip: tabs would ask the person to manage two surfaces when the whole point is that one of them is what they are working on. The width is the details column's own contract, so a document arriving over an already-sized column keeps the width its owner chose.

### The plugin is vendored, and diverges by where it renders

`dsh-univer-office` declares eight `@deepseek-ai/*` peer dependencies, and npm and bun install missing peers — the second-harness download this repository fixed once already ([why](2026-08-28-peer-installed-upstream-duplicates.md)). So it is vendored.

Unlike `genui`, **its own bundles are not rewritten**. Its host half imports the upstream names, and the vendored manifest answers them with npm aliases onto our packages (`workspace:@unieai/uad-tools@*` and siblings). Resolution is a manifest fact; the code stays upstream's, and a sync carries no rename.

Two strings are exempt and load-bearing, and every sync reverts both because both come from upstream. The module-loader id inside `lib/client.js`: the shell fetches a plugin's bundle by package name and refuses one that registers under another id — and the refusal is not local, the whole plugin system fails to load. The first run of this integration produced exactly that: a page reading "Failed to load plugins" with the harness otherwise healthy. And the plugin name inside `cordis.patch.yml`, which is what mounts this plugin into a composition; left at upstream's name it names a package that does not exist here. `sync-vendor-univer-office` rewrites both and asserts both afterwards.

**Reaching the layout is an optional-service lookup, not a property read.** `ctx.layout` on a context whose plugin did not declare `layout` in `inject` THROWS; it does not read as `undefined`. The dock's entry did exactly that, so it crashed on every render and took the composer's whole dock row with it — visible as `slot entry crashed in 'conversation.input.dock'` with the rest of the page healthy. `ctx.reflect.get('layout', false)` is cordis's non-throwing lookup (the proxy's own trap uses it), and it is what keeps the promise this integration makes: a shell without a layout service still mounts the plugin and floats its windows.

The behavioural divergence — docked instead of floating — is a source change, so the five changed files live in `vendor/univer-office/patch/` and `pnpm run sync-vendor-univer-office <version>` overlays them onto a clean upstream checkout, rebuilds `lib/` with upstream's own build script, and takes the 143 MB of prebuilt artifacts from the published tarball untouched. The divergence is a diff someone can read rather than a memory.

The dock keeps owning which files are open — that logic is upstream's and correct — and portals its window stack into the column's host. A shell without the `document` slot renders no host, and the dock floats exactly as upstream does.

## What shipping it decided

Three of the plugin's runtime dependencies — `@univerjs-pro/cli-assets`, `engine-formula-rust-binding`, `exchange-node-binding` — publish **no licence at all**: no `license` field, no LICENSE file. The plugin is Apache-2.0; that covers the plugin, not them.

`gen-third-party-notices` refused the build, which is what it is for. The terms were not invented: `UNSTATED_TERMS_RUNTIME` records that they are unstated, that they ship on the repository owner's instruction of 2026-08-29, and that written confirmation from dream-num is outstanding — and the notices carry a section of their own saying so. If the answer forbids redistribution, the plugin moves out of the default bundle and becomes an opt-in install; nothing else about this note changes.

## Alternatives considered

**Two columns side by side, details and document.** On a laptop that leaves neither usable, and the request was for a sidebar, singular.

**A tab strip over the shared column.** Asks the person to manage two surfaces when the whole point is that one of them is what they are working on.

**Keep upstream's floating windows.** No fork divergence to carry, and it loses the thing this was for: a window over the transcript makes the person choose between reading what the agent said and looking at what it produced.

**Depend on `dsh-univer-office` instead of vendoring it.** Its eight `@deepseek-ai/*` peers are installed whether or not anything links them, which is the second-harness download this repository already fixed once ([why](2026-08-28-peer-installed-upstream-duplicates.md)).

**Rescope the vendored bundles, as `genui` needed.** Unnecessary here: the manifest answers the upstream names with npm aliases onto our packages, so resolution is a manifest fact and a sync carries no rename.

## Consequences

An office document opens where the work is, and the transcript stays readable beside it. The column has two possible occupants now, so anything that wants the right column has to go through the layout rather than render into `details` directly — one more indirection, and the reason a document can survive a session change while tool details correctly do not.

Shipping it costs about 150 MB per install of prebuilt Univer artifacts, and a vendored copy that ages. It also puts three unlicensed runtime dependencies in the bundle on the repository owner's instruction, recorded as `UNSTATED_TERMS_RUNTIME` with dream-num's written confirmation still outstanding; if the answer forbids redistribution, the plugin becomes an opt-in install and nothing else here changes.

## Verification

Against a running `rabi web` in a real browser at 1440×900: the Univer host renders inside the right column (`col.contains(host)`), the column is 420 px at x=1020, and the host fills it at 419 px. `pnpm-lock.yaml` holds no `@deepseek-ai/` package.

`ui-layout` covers the rule itself: the column changes occupant on open and close, and stays open for a document while no session is current. Removing `documentOpen ||` from the frame's width solve turns the second one red.
