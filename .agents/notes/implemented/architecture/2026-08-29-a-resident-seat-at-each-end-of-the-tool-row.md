# Agent Note: a resident seat at each end of the composer's tool row

Status: implemented

English | [中文](2026-08-29-a-resident-seat-at-each-end-of-the-tool-row.zh.md)

## Problem

The machine picker sat at the left end of the composer's tool row, next to the commands button, and it was the only occupant of `conversation.input.chrome`. Three things about it were wrong at once, and the person who reported them reported them as one thing.

It was a text chip in a row whose other controls are 32 px icons, so it read as a label rather than as something to press. Its menu was 220 px wide with no maximum height, so a person with more than a handful of machines got a list that ran off the screen with nothing to scroll. And the menu's surface was `var(--dsw-alias-surface-raised, #fff)` — a token that **is not defined anywhere in this repository**, so the fallback always won and the card was white on a dark shell. Every other dropdown in that row already used `--dsw-specific-menu`, which the theme rebinds.

The menu also always opened upward (`bottom: calc(100% + 6px)`), including on the hero screen where the composer is centred and there is nothing above it.

## Decision

**The tool row has two resident ends, and they are the same seat twice.** `conversation.input.chrome.end` is declared beside `conversation.input.chrome`: same `list` kind, same root scope, same owner share, differing only in which end of the row renders it. The machine picker moved to it.

Root scope is the load-bearing half. `conversation.input.right` is the existing right-end seat and it carries an `InputZone`, so it cannot render before a session exists — and where work runs is true before anyone has started a conversation, which is exactly why the picker needs a resident seat. The end seat renders in the trailing group, first in the icon cluster, so the send button stays the row's last control.

**The trigger is an icon on this computer and a named chip anywhere else.** A bare laptop glyph matches the row's other icons; the machine's name appears the moment work is leaving this computer. The old chip stated the machine unconditionally, which is what made it look like a label; dropping the name entirely would have lost the property that matters, because an icon cannot say *which* machine.

**The menu is the model picker's card, restated.** Same surface token, border, radius, shadow and scrollbar rebinding, plus a 320 px minimum width and a 420 px maximum height with the machine list — and only the machine list — scrolling inside it. *Add a machine* and the configuration hint stay in place, so a person with thirty hosts does not scroll past all of them to reach the thing they came for.

**It opens downward, and upward only once the composer is docked.** Keyed on the shell's phase, copied from the model picker, and for the model picker's reason: the transcript column grows to whatever the composer needs, so a downward menu always "fits" and then covers the control that opened it. There is no free space to measure.

## Alternatives considered

**Move the picker into `conversation.input.right`.** One fewer key, and wrong: that seat is session-scoped, so the control would vanish from the hero screen — the one place where choosing a machine decides which folders a person can even pick.

**Redefine `conversation.input.chrome` to render at the right end.** Also one fewer key, and it silently relocates any future occupant of a published extension point. The left end is a legitimate seat with no occupant today; naming the second one is cheaper than moving the first.

**Define the missing `--dsw-alias-surface-*` tokens.** The colours the fallbacks named would have had to be invented for both themes, and the row already has a token for exactly this surface. Inventing a parallel scale beside `--dsw-specific-menu` is how two menus start looking different.

**Keep the name on the chip always.** It is the most informative state, and it is why the control did not read as pressable. The icon carries the identity through `aria-label` either way, so nothing is lost to a screen reader.

## Consequences

The machine picker is now three controls away from send instead of across the row, which is where a person looks when the question is *where will this run*. The cost is one more SlotMap key to keep documented, and a `conversation.input.chrome` seat that ships with no occupant — a published extension point that exists because the left end is still a reasonable place for resident chrome, not because anything needs it today.

Two invented tokens are gone from this package (`--dsw-alias-label-danger`, `--dsw-alias-label-success`, and the two surface names), replaced by the real ones. Nothing else in the repository referenced them, so no other surface changes.

## Verification

Measured in a real browser against a running `rabi web` at 1440×900, in both themes: the trigger sits at x=1064 between the commands button (475) and voice (1147) and send (1185); the menu is 330 px wide with `max-height: 420px` and an `overflow-y: auto` list; its background resolves to `rgb(255, 255, 255)` with `rgb(13, 13, 13)` text in light and `rgb(63, 63, 63)` with `rgb(236, 236, 236)` in dark; and its right edge stays on screen. The trigger measures 32×32 on this computer and grows to 77 px carrying `testbox` when a remote machine is selected. Under `data-phase="active"` the menu flips above the trigger.
