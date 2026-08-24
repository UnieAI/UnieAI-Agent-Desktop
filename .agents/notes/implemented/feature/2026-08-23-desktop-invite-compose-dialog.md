# Agent Note: The desktop invite modal, and the four places its design outran the data

Status: implemented

English | [中文](2026-08-23-desktop-invite-compose-dialog.zh.md)

## Problem

The Invite friends page listed the account's referral standing and carried an inline address field with a Send beside it. A reference design arrived for the same task drawn as a modal: a hero band under a product mark, a green notice strip stating the reward per invite with an eligibility link on its right, a centred title and description, one address field, and a pill Send that stays closed until the address is plausible.

Three of those parts describe facts this product does not hold. `UnieAiInvites` reports banked rate-limit resets, a sent count, and the sent invites themselves; no field reports a reward RATE, and no field anywhere in the account contract, the desktop BFF, or `packages/unieai/web-gate` carries a terms URL. The product mark is real but lives outside this package's reach. The fourth part — the field itself — already existed on the page, so drawing it again in a modal would put two composers behind one screen.

A design cannot be built by filling its empty places with plausible numbers: a reward figure invented here would be a promise the product never made, and a link with no target is worse than an absent one.

## Decision

**Composing moved into `InviteFriendDialog`; the page keeps the standing and gains a trigger.** The card draws the banked resets, the sent count, and the sent invites with their own copy controls; `invite.compose` opens the dialog, which owns the field, the Send, and the four `UnieAiInviteResult` outcomes. The trigger exists only where the gateway offers `sendInvite`, so a deployment with read-only referrals shows a summary rather than a button opening a dialog that cannot send.

**The reward strip prints the rate line, not a figure.** `invite.reward` — "1 rate-limit reset / per invite" — is the referral terms this package's dictionary already carried in all four locales, and it is fixed copy by nature: a rate is a term of the programme, not a per-account reading. `UnieAiInvites.credits` is the balance already banked, a different fact, and it stays on the page where it was. Nothing in the strip is computed from the account, and the reference's points figure appears nowhere.

**The eligibility link is absent rather than dead.** No terms URL exists to open, at any layer between the section and the product, so the strip ships without the link.

**The hero tile carries the invite's subject, not the product mark.** The mark is a `sidebar.brand.mark` slot occupant provided by `ui-brand-unieai`. Cross-plugin collaboration goes through slots and services, never a value import, and a `settings.section` entry declares no child slots, so this package can reach the mark by neither route. The tile draws `IconUserOutline16` on white. The substitution is recorded in both READMEs under Known Limitations, because the fix is a brand seat a settings page can render through, in packages this one does not own.

**Send is closed until the address is plausible**, by `isPlausibleEmail`: a local part, `@`, a dotted domain. That is a formatting pre-check, not a second copy of the product's rule — which addresses are acceptable, and which are the account's own, stay the supplier's verdict and arrive as `invalid-email`, `self-invite`, `already-invited`. The gate is enforced in `submit`, not only on the button, so a direct form submission cannot bypass it.

**The hero is this package's one fixed plate.** It is the same brand-blue band under both palettes carrying a white tile, so it paints from the palette-invariant `--dsw-static-deepseek-*` ramp — which `ui-theme/src/styles/design-platform.css` documents as UnieAI brand blue — and `--dsw-static-neutral-00`. A `--dsw-alias-*` fill would invert it into a dark band under a white tile. Everything below the hero is theme-owned: the strip is the `state-success-*` family, type is `label-*`, radii come from the shared scale, and the sheet writes no literal colour. `tests/styles.client.spec.ts` pins both halves of that split, and pins the doubled-class selectors (`.dialog.dialog`, `.field.field`) that beat the `Modal` and `Input` primitives' own geometry regardless of stylesheet order.

The strip's icon is `IconRefreshOutline16` rather than the reference's coin: no coin glyph exists in `ui-primitives`, and what an invite earns is a reset.

## Alternatives considered

**Keep the inline composer and add the dialog beside it.** Two address fields for one task, on one screen, differing only in which was opened. The page's own prose already rejects naming one topic twice; a second composer is that failure with state attached, since the two could hold different drafts and different verdicts.

**Move the dialog behind the account menu's Invite friends row.** That row opens the settings panel at `unieai-invite`, and the panel's nav is what tells a reader the topic is a place they can return to. Replacing the page with a modal would delete the standing — the balance, the count, the sent invites and their links — which has nowhere else to live.

**Show `credits` in the reward strip.** It is a real threaded number, which is exactly why it must not sit under a line that reads as a rate: a balance of 2 under "what one invite earns" states something false. It stays on the page, where `invite.credits` names it as a balance.

**Give the eligibility link a plausible target** — the product's marketing site, or the invite endpoint's origin. Both are guesses at a page nobody confirmed exists, and a link that 404s costs the reader more than the absence does.

**Copy the UnieAI mark's path data into this package.** Fifteen lines of SVG, and the brand artwork would then have two homes that drift on the next brand change.

**Use `FishLogo` from `ui-primitives`.** It is a value import this package may legitimately make, and it is DeepSeek's fish: the sidebar's fallback for compositions that ship no brand occupant. The shipped desktop composes `ui-brand-unieai`, so the fish appears nowhere else in this product, and putting it on an invite hero would brand the modal for the wrong product.

**Validate the address the way the supplier does.** The supplier's rule set is the one that decides, and a fuller regex here would only disagree with it in cases this package cannot test. The pre-check is deliberately the shape below which the request cannot succeed at all.

## Consequences

- Sending an invite now costs one press before the field appears. The page in exchange states the account's standing without a form under it.
- The dialog reuses `invite.title`, `invite.body`, `invite.reward`, `invite.emailPlaceholder`, `invite.send` and the refusal lines; `invite.compose` is the one new key, added to all four bundles. Copy that reads twice on one screen — the page's title and the dialog's — is on two surfaces, one masking the other.
- The reference's reward figure and eligibility link have no shipped equivalent, and will not until the supplier reports a rate and a terms URL. Both are recorded in `packages/client/ui-unieai-account/README.md`.
- The hero is the only place in this package where a `--dsw-static-*` name is painted directly. The style gate holds the rest of the sheet to aliases, so the exception cannot spread quietly.
- `tests/invite-friend-dialog.client.spec.tsx` pins the closed-Send gate, the direct-submit bypass, the in-flight freeze, all four outcomes, and the absence of any invite link or code in the dialog.
