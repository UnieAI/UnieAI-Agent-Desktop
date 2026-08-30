# Agent Note: a preset may own a plugin that draws

Status: implemented

English | [中文](2026-08-30-a-preset-may-own-a-plugin-that-draws.zh.md)

## Problem

`genui`, `univer-office` and `tool-page-capture` were mounted in the HOST composition, and all three register model-facing tools. A host row registers into the process-global catalog, which every agent inherits — so the `minimal` preset, whose whole definition is `bash` plus `str_replace_editor`, carried seventeen more. Every request on every preset paid for their schemas, and a `minimal` session could call Office tools it was defined to exclude.

The rule they broke is the one `standard/agent.cordis.yml` states about itself: the host composition keeps the registries, the sandbox and approval stack, persistence and the model route; a preset keeps what one session adds. `shipped-composition` asserts it directly — `ctx.tools.schemas()` with no agent must be empty — and read sixteen.

Moving them was not enough, and that is the interesting part. All three are dual-face packages: `genui` draws the panel, `univer-office` draws the document viewer. A browser gets its plugin bundles from `window.__DSH_BOOT__`, composed once when the page loads, from the packages the **Loader** currently has entries for. A preset's standing composition is built by `ensureStanding` on the first agent that joins it — after the page has booted. Moved as-is, both packages left the boot graph entirely: measured, 56 entries before and 54 after, with neither package among them. The tools would still run and nothing would be drawn.

## Decision

**The roster declares its presets' packages to the client module registry, and the registry serves a browser half for a package no Loader entry names.**

`ClientModuleRegistry.declare(names)` adds package names to a second source beside the entry scan. `processOne` already asks "does this name qualify"; a declared name qualifies without an entry, and everything downstream — metadata resolution, the bundle route, the boot graph — is unchanged. It is an effect: the disposer withdraws the names again.

`AgentPresetRoster` supplies them. It knows every preset's composition path, and `compositionPluginNames` reads one with the Loader's own YAML dialect — the same parse `compositionProblem` already does for health — walking `config` arrays so a group's members are found. The registry resolves each name against the package graph and caches the ones that are not packages (`cordis:group`, subpath rows) as a negative verdict, which is what it already does for host rows.

The dependency runs roster → registry, which is the right direction: the thing that knows a package will be mounted per-session tells the thing that serves browser halves. The injection is optional — a composition with no browser surface mounts no registry and the roster declares nothing.

**`page_screenshot` moved too.** It is this fork's own package, and it is model-facing, so the same rule puts it in the preset. It was the one tool left in the global layer after the other two moved.

## What this buys beyond the three packages

A plugin that ships tools AND a surface can now belong to a preset. Before this, such a plugin had to sit in the host composition to be drawn at all, and its tools then reached every agent regardless of preset — so "which plugins does this preset have" and "which plugins can draw" were the same question, answered host-wide. They are separate now, which is the boundary a plugin system needs.

## Alternatives considered

**Mount the default preset eagerly at boot.** The standing composition would then exist when the page composes its graph, and no registry change would be needed. It makes every preset plugin live before any session exists, costs startup time on a surface whose cold start is already the complaint, and answers only for the DEFAULT preset — a session naming another one is back where it started.

**Leave them in the host composition and relax the assertions.** The smallest diff, and it writes the regression into the baseline: `minimal` stops meaning minimal, and the next plugin to ship a tool inherits the same leak with a test that now says it is fine.

**Have the registry read preset compositions itself.** It would need the roster's roots, its precedence rules and its user-directory resolution — all of which belong to the roster. Declaring is the smaller seam, and it also covers a preset the roster learns about some other way.

## Consequences

`minimal` is two tools again, the global catalog is empty, and `standard` carries the seventeen it always effectively had — `shipped-composition`'s roster grew by exactly those names, which is the same catalog a `standard` session always saw.

The registry now has two sources of package names rather than one. A declared name that never gets mounted still serves a bundle, which costs a fetch on a page that will not use it; the roster only declares packages its own presets name, so the set is bounded by the shipped compositions.

A headless host now ships the node halves too. `python/sdk-runtime` — the single-file executable behind the Python SDK — loads the same shipped presets, so `verify-runtime-closure` requires every preset plugin in its dependency manifest; moving these three into `standard` is what put them there. That is correct: the exe can call the `panel` tool, it simply has nowhere to draw it. What the exe does not need is genui's browser half, so genui's six `@unieai/uad-client-*` peers are now `optional` — its node entry imports them type-only, and a host that draws supplies them, the same shape `app-boot` already uses for `cordis-plugin-hmr`. `page-capture` is the opposite case and reads as one: `@unieai/uad-browser-operator` is a real import of its node half, so it joins the closure rather than being waved through.

## Testing

`packages/client/modules` and `packages/preset/agent-presets` suites, 183 tests.

In a real browser against the shipped Web composition: both packages are in `window.__DSH_BOOT__` after the move (56 entries, `@unieai/genui` and `@unieai/univer-office` among them) — the check that would have caught the naive move, which produced 54 and neither.

`minimal-preset.snapshot` pins the RL request's tool list at `bash` and `str_replace_editor`. `shipped-composition` pins the empty global layer and the `standard` roster.
