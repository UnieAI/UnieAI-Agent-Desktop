# Agent Note: UnieAI chrome metrics in the primitive and the settings shell

Status: implemented

English | [中文](2026-08-22-unieai-chrome-metrics.zh.md)

## Problem

This repository is a fork of DeepSeek Harness shipped as a UnieAI product, and the [brand swap](2026-08-22-unieai-rebrand.md) changed only marks and token values. The chrome kept DeepSeek's figma geometry, so two surfaces the product owner compares against the UnieAI Copilot reference side by side did not match it.

The account dropdown was drawn by `ui-primitives`' `Menu` at the figma card — 218 wide, radius 12, 40px rows at `8px 10px` on 14/22 — against the reference's 240 wide, radius 6, 36px rows at `8px 12px` on 14/20. The primitive portals its list, and `className` lands on the anchor wrapper, so no caller can reach those metrics. The settings panel was an 800x800 card at radius 24 whose title sat inside a 188px nav rail, against a dialog that is 70vw by 90vh at radius 8 with the heading in a band spanning both columns and the two columns centred under it.

## Decision

The reference's dropdown metrics are the primitive's defaults, not a variant. `Menu`'s card is 240 wide at radius 6 with its 4px inset, a row is 36 tall at `8px 12px` around a 14/20 line at radius 4, a heading takes the rows' own 12px inset, and a nested card hugs its rows from a 128px floor. Every menu in this product is the same chrome; a second set of menu metrics would have left the account menu in one visual language and the other ten call sites in another, which is the split this work exists to remove.

The two existing size options absorb the change without their own edits. `compact` (JsonTree's copy menu) restates card width, inset, radius, row height, gap, padding, radius, and type, so nothing it draws moves. `dense` (the workspace group-by menu) overrides the block axis only and keeps its 34px row on the new 12px inset.

`MenuLabel.text` is a `ReactNode`. A heading carries marks its owner draws on it, and the reference's account header is one label holding the address with the plan beside it as a bordered pill; only the account package knows what a plan is.

The settings shell is the reference dialog resolved from its Tailwind source into CSS Modules. `SettingsRoot` renders a header band across the panel's full width — heading, one-line summary, and the registrant-owned actions, its content held to an 896px measure — then one scroll region holding both columns centred at a 1024px measure: a 176px navigation that sticks 16px below the top of the scroll, a 32px gap, and the section beside it. Below 768px the columns stack and the navigation becomes a horizontally scrolling strip with its group headings hidden; below 640px the panel is full screen with square corners. The close button is pinned to the panel's corner rather than laid out in the band, because the band's content is centred on a measure and the close belongs to the dialog.

The band's heading is the dialog's accessible name directly. The reference marks its `DialogPrimitive.Title` `sr-only` and repeats the words in a visible `h1` because Radix takes the accessible name from that element and shadcn's title slot does not fit the band; this shell owns its own dialog element, so the visible heading carries the `aria-labelledby` and there is no second copy of the words.

The summary line is shell copy, like the nav's group headings, because no registrant owns an arrangement of other registrants. It describes the panel without enumerating sections: which sections exist is a fact about the composition, and the reference's own enumeration names pages this build does not have.

## Alternatives considered

**A documented `Menu` variant carrying the reference metrics.** Rejected because it preserves exactly the inconsistency being removed: the account menu would match the reference and every other dropdown in the same product would not. The primitive's other consumers were checked individually instead — no caller sizes an anchor to the card, measures a row, or overrides these properties, and the two size options already restate what they need.

**Reproducing the reference's full-bleed menu separator (`-mx-1 my-1`).** Rejected on a real cost: `.viewport` is the scroll box for menus without submenus, and a hairline 4px past its inline edge is scrollable overflow, so every separator-bearing menu would gain a horizontal scrollbar. The separator spans the row column's width instead.

**Putting the settings heading in a visually-hidden node beside the visible one, as the reference does.** Rejected: that node exists to satisfy Radix, an ownership this shell does not have, and a duplicate accessible name is a cost with no benefit here.

## Consequences

Ten `Menu` call sites moved with the primitive: the composer's permission select and agent-preset seat, the workspace picker, browser, and two row-action menus, the settings General rows (permission preset, language, enter behavior), the account menu, and JsonTree's copy menu. Each was opened and measured in the running app; every non-`compact` list is now 240 at radius 6 with 36px rows, `dense` keeps 34, and `compact` is unchanged.

The settings sections gained roughly 120px of width at 1440 and lost the panel's fixed 800px ceiling, because the content column is now what remains of a 1024px measure after the nav and gap. No section was edited.

`ui-model-selection` draws its own dropdown rather than consuming `Menu`, so the model picker keeps radius 12 and 40px rows and is now the one dropdown in the product that does not match the others.

## Deferred

The account menu's header is still two plain heading rows — the address and the plan — where the reference has one label with the plan as a bordered pill. The primitive now accepts the node; the badge markup belongs to `ui-unieai-account`, which was owned by another change when this one shipped.
