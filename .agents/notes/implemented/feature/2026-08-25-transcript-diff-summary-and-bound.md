# Agent Note: the diff a transcript row states, and the height it may take

Status: implemented

English | [中文](2026-08-25-transcript-diff-summary-and-bound.zh.md)

## Problem

A file edit's diff was already rendered in the transcript row — `file-mutation-row` passed `diffCardModel(block)` into `ToolRow`, drawn by the shared `DiffBlock`, from the same model the details panel uses. The renderer needed no extraction.

Three things were missing around it. The collapsed row named the file and not the size of the change, so deciding whether to open it meant opening it. `DiffBlock`'s own "show the rest" control lifted the row's line cap into an unbounded body, so one long edit could push the rest of the conversation off screen. And `str_replace_editor` reached the generic card without the summary the keyed rows carried.

## Decision

**The collapsed row states `+A −R`, from the same arithmetic the expanded footer prints.** Those counts were computed inside a module-private function, so stating them outside the card would have meant a second implementation of the line-terminator and distinct-path rules. `diffStats(diffs)` is exported and both callers use it, pinned by a test — the footer and the summary cannot disagree.

**The expanded body has a height ceiling and scrolls inside it.** The cap rides `DiffBlock`'s body through the same rebindable custom property `TerminalBlock` already uses for its output, so the details panel — which sets nothing — keeps its full-height reading surface. The cap is on the body, not the card root, so the copy control and the footer stay put while only the diff lines move.

**`str_replace_editor` gets the summary but not the keyed row.** It is a multi-command tool whose `view` and `insert` commands declare `card: 'generic'`; an unconditional "Edit" title and path link would be wrong for those.

**A running call renders the intended hunk, never a partial one, and a failed one renders no diff at all** — it reads its result, not the call-time diff, so a failure shows the error line rather than a change that did not land.

## Alternatives considered

**Write a second diff renderer for the transcript.** Rejected on discovery: there was already one, shared, and the brief that asked for an extraction was working from a stale premise.

**Cap the row by truncating the diff model.** Rejected: the counts would then describe the truncation rather than the edit, and the footer's "N files" would disagree with what the rows showed.

## Consequences

A reader decides whether to open a diff from the collapsed row. A long edit stays inside its own scroll container. The two places that state a change's size are one implementation, so a change to the counting rules cannot land in one and not the other.
