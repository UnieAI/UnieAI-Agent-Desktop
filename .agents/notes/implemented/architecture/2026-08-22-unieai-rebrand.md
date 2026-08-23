# Agent Note: UnieAI brand as a composition swap

Status: implemented

English | [中文](2026-08-22-unieai-rebrand.zh.md)

## Problem

This repository is a fork of DeepSeek Harness shipped as a UnieAI product. Every brand-carrying surface still named DeepSeek: the sidebar and Hero marks, the browser title, the web manifest, the favicon, the pre-React boot wordmark, and the onboarding welcome notice. The blue in `ui-theme` was DeepSeek's brand ramp.

A rebrand must not fork the client UI. The fork tracks upstream, so anything edited in place becomes a rebase conflict on every sync, and `docs/web-styling.md` forbids Tailwind and component libraries, which rules out importing the reference product's components.

## Decision

The brand is replaced by composition and by token values, never by editing the surfaces that consume them.

`@deepseek-ai/dsh-client-ui-brand-unieai` occupies the three generic brand slots (`sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`) through the same nested `slots.inject()` generator the upstream official-brand package uses, so all three occupants install and withdraw as one transaction. The web-app roster drops the `ui-brand-official` row rather than shadowing it: those cells are `single`, and two occupants would contend for them. The upstream package stays on disk, unmodified and still referenced by the client aggregate, so upstream edits to it continue to merge cleanly.

`--dsw-static-deepseek-*` keeps its name and changes its values: an 11-step ramp on hue 215 anchored so step 500 is exactly `#006AFF`, the single brand colour the UnieAI design contract admits. Steps 800 and 900 desaturate toward slate, matching the ramp they replace so existing consumers keep their intended weight. Renaming the token would touch every consumer and conflict on each rebase while changing nothing a user can see.

`--dsw-alias-brand-primary` is deliberately untouched. It resolves to neutral ink and backs `--dsw-alias-button-primary-fill`; the reference design contract independently specifies neutral ink for the same role, so the two systems already agree.

The mark is inlined as path data with `fill="currentColor"`, and its colour is one declaration in the package's CSS Module. The name is set in the product typeface: UnieAI ships no wordmark artwork.

## Alternatives considered

**Shadow the official-brand row instead of removing it.** Registering at a lower `priority` would leave both packages mounted. Rejected: the official package already self-disables outside an `official` build profile, so the shadow would be load-bearing only in a configuration we do not ship, and two occupants competing for `single` cells is harder to reason about than one roster row.

**Rename the ramp to `--dsw-static-unieai-*`.** Semantically tidier, and rejected on cost: it touches every consumer plus the token block, and each of those lines then conflicts on an upstream rebase, in exchange for a name no user ever sees.

**Port the reference product's components.** Ruled out by `docs/web-styling.md`, which forbids Tailwind and component libraries; the reference product is built on both.

## Consequences

Feature packages are unchanged. Because `docs/web-styling.md` forbids literal colours in feature CSS, re-valuing one ramp reached every surface; only seven call sites outside `ui-theme` consume the ramp at all.

The welcome notice version was bumped, so every user sees the replaced notice once.

`LICENSE` gains a UnieAI copyright line beside DeepSeek's. The MIT terms require the original notice to survive in all copies, so this is an addition, never a replacement.

Two tests pinned strings this note changes — the boot wordmark and the exact welcome copy — and were updated with the behaviour they describe.

## Deferred

The typeface is unchanged. The reference product uses Geist, loaded through a framework font pipeline that does not exist here; adopting it means vendoring the font files, which is a separate change with its own licensing review.

The login page introduced by the Studio device-flow work will restate roughly fifteen token values inline, because it is served before any client bundle exists. That duplication is accepted and belongs to that change.
