# @deepseek-ai/dsh-client-ui-unieai-account

English | [中文](README.zh.md)

This package fills two kinds of seat from one account state: the sidebar's bottom-left account row, and **three** `settings.section` entries carrying the personal half of the UnieAI web product's settings — **Account** (who you are signed in as, your token activity, and the session itself), **Usage** (`Regular usage limits`), and **Invite friends**. All three register ahead of General, in that order, so the panel opens on the person using it.

Three pages rather than one page with three anchors. Usage and invites are each a topic a reader opens the panel for on its own, and the panel's nav is the only surface that can say so; an anchor into the middle of one long page left the nav row highlighted while the reader was already looking at a different heading. Every page renders in every account state; the section below on signing out says what each one draws.

The section deliberately carries nothing platform-, organisation-, or enterprise-facing. That is a property of its data contract rather than a rule someone has to remember: [`src/account-contract.ts`](src/account-contract.ts) declares an account with an identity, a plan **label**, metered allowances, an activity series, and a referral standing, and no seat, group, audit, SSO, or billing field exists for a component to render.

Appearance and language are absent on purpose. Both are already General-section rows owned by the features that own the preference — `ui-theme` contributes Appearance, `locale` contributes Language — so this section names where they live in one line instead of giving either preference a second control.

## The sidebar account row

`sidebar.account` is the left of the sidebar's last row, and this package fills it. It is the same source the section reads, rendered as a 28px round identity mark and the display name at 13/500 that takes the slack — and nothing else. The row BOX around them is not this package's: the settings glyph shares that row, so the 248x40 line (`6px 8px` of padding, 10px gaps — the geometry the UnieAI web product gives its own user row: `rounded-lg px-2 py-1.5`, `gap-2.5`, a `h-7 w-7 rounded-full` mark) belongs to the sidebar foot's identity seat, and this occupant draws no second box. The 56px rail keeps the mark alone, in that seat's 36px control, and moves the line into its tooltip.

The row is a **menu trigger**, the way the UnieAI web product's own sidebar foot is: `aria-haspopup="menu"`, and pressing it opens the account menu upward. Only the identity half is that trigger — the settings glyph beside it is a separate control, exactly as it is in the reference. Its hover fill reaches back out through the seat's padding and stops halfway across the gap before that glyph.

What the row SHOWS is still decided by the state, not the layout. `unavailable` — the state a build without a gateway ships in — draws a person glyph and says nobody is signed in. Only `signed-in` names a person, and every value in it comes from `UnieAiAccount`.

## The account menu

The menu's order, conditionals and behaviour are the reference's, read from its source rather than from a screenshot: the account header, then Profile, Usage, Invite friends, the appearance row, Language with its submenu, then a separator and Sign out. It opens `side="top"`, `align="start"`, 8px off the trigger.

Every row is wired to something dsh already has, and a row with nothing behind it is not drawn:

- **Profile / Usage / Invite friends** open the settings panel on this package's three sections — `unieai-account`, `unieai-usage`, `unieai-invite` — exactly as the reference is one dialog at three tabs. They need ui-settings' `settingsPanel` service; without it the three rows are absent.
- **Light mode / Dark mode** switches `ctx.theme`, and — as in the reference, which calls `preventDefault()` on this row — the menu stays open so the switch can be seen and undone. Without a theme service the row is absent.
- **Language** is `ctx.locale`'s own four locales with a check on the active one.
- **Sign out** is the gateway's `signOut`, which posts the gate's logout and reloads. It exists only while a session does; with no gateway there is nothing to sign out of, so no row.
- **Sign in** is this menu's one departure from the reference, which is always signed in. The row used to BE the sign-in gesture; now that it opens a menu, that gesture moves into the menu rather than leaving the column.

Platform administration is absent for the reason it is absent upstream: that row is already conditional on `isAdmin`, and this is the personal edition, so the condition is never true. Nothing was removed.

Service presence is read live, not snapshotted at apply. Cordis activation order is unconstrained, so a panel or theme that activates after this plugin must still light up its rows; reading them once at apply is how those three rows first went missing.

## The Account page's header

The page opens the way the UnieAI web product's settings page opens: a 64px identity mark, the display name at 18/28/600, the plan under it, and the five-cell activity strip the product prints — total tokens, peak tokens, longest task, current streak, longest streak.

The second line is the plan and only the plan. The web product prints `@handle · Plan` there, and this product has no handle: no column, no route, nothing that could report one. The section used to stand the sign-in address in that place, which printed the same address twice on one page — once decorated as a handle, once as the address — so the substitution is gone and the address keeps its one home in the session card.

The strip's figures are `UnieAiAccount.activity.stats`, keyed by the five stat ids and already formatted by the supplier — the five differ in unit (a count, a duration, a day span) and only the supplier knows which unit its number carries. A figure it did not report prints an em dash. That is the whole reason the strip is drawn in every state including `unavailable`: it shows what this screen IS without any cell ever reading as a zero the account never reported.

## Token Activity

Under the strip, the same contribution-style grid the reference profile page draws: 53 whole weeks ending on the week containing today, one column per week, one cell per day, with a Daily / Weekly / Cumulative toggle over it. Daily colours a cell by its own tokens, Weekly colours all seven cells of a column by that week's sum, and Cumulative colours by progress through the year's total. The levelling is the reference's — quartiles of the account's own non-zero values for the first two modes, even fifths of the grand total for the third — so the two surfaces read the same rather than being two dialects of one chart.

Three things are this package's rather than the reference's, each because the reference's answer is unavailable here:

- **The grid is built in UTC.** The supplier keys its series by UTC day, and a grid aligned to the reader's zone would put a day's tokens under the neighbouring cell for every reader west of Greenwich.
- **There is no `date-fns`.** Week alignment and a `YYYY-MM-DD` key are a dozen lines of UTC arithmetic. The one piece that genuinely needs locale data is the short month name under each column, which `Intl` supplies from the active locale id — the section's only reason for knowing which locale is active — and which falls back to the month's number where a runtime carries no data for that language.
- **The shade ramp mixes two tokens.** The reference ramps ten Tailwind zinc literals, five per palette; this repository allows no literal colour. Level 0 is the empty cell's surface, level 4 is the page's ink, and the three steps between them are `color-mix` of exactly those two — one expression that inverts correctly in both palettes on its own. The five percentages themselves have no token: no `--dsw-*` name expresses a five-step neutral ramp, so they are this sheet's own numbers and say so.

The grid fills its container and scrolls inside itself below 689px (53 columns at the 10px under which a cell stops being legible), so a narrow settings panel scrolls the grid rather than the page. An account whose supplier reported the strip but no series says so in one line: a year of empty cells reads as "you did nothing", which is a different claim from "nothing was reported".

Name, avatar, and plan appear only in that header, and the header is also where the first two are CHANGED. The card under it carries the sign-in address and the way out of the session and nothing else, so no fact on the page has two homes.

## Editing in the header

There is no separate Profile card. The 64px mark IS the change-avatar trigger, and the display name turns into a field in place.

The name keeps a small pencil beside it rather than accepting a click on the words themselves. A header that silently responds to a click teaches nobody that it does, and a touch reader never discovers it at all — the same reason the mark carries a persistent chip instead of a hover overlay. Pressing the pencil swaps the name line for the field, a Save, and a Cancel.

Staging a photo opens that same form. There is one Save on the page and it stores both facts, so it is never drawn without the field it belongs to standing beside it; a Save button floating over a header would be attached to nothing the reader can see. Cancel, and a save the supplier accepted, both close the form and drop every local edit, which is what returns the header to the stored account.

The copy is the reference profile form's own, taken verbatim from the product's `Settings` messages in all four shipped locales; `Edit display name`, the pencil's accessible name, is this package's, because the reference has no in-place editor to have named one.

Pressing the mark opens the change-avatar dialog, which picks a file, shows exactly the square that will be kept, and confirms it. Everything but an animated GIF is cropped centred to a 512px PNG before it leaves the page, as the reference does — the avatar travels and is stored as a base64 `data:` URL, so an uncropped phone photo would put megabytes into the account row and into every later read on both surfaces. A GIF is passed through whole, because a canvas re-encode would keep one frame of it. The accepted formats are the product's own list, so the picker never accepts a file the save would refuse.

The header holds no copy of the stored profile. The field and the mark fall back to the account it renders and are overridden only by an edit actually made, so a save that lands — here or in a browser — is adopted the moment the snapshot moves, and a name-only save carries no avatar field at all: an absent one is how the supplier is told to leave the stored photo alone.

Validation is the supplier's. This package refuses to submit a blank name, because the field is required and saying so locally is faster than a round trip; every other rule — length, image type, image encoding — belongs to the product, and a second copy here could only decide differently.

## What each page does signed out

`signed-out` and `failed` are ordinary states here, and there are three pages to answer them on. All three draw the same not-connected card: the page keeps its title, says why it is empty, and offers the one action that fills it (`Sign in`, or `Try again` over the supplier's own message; `unavailable` explains that this build ships no account service and draws no button, because there is nothing for one to reach).

Neither alternative survived the reader. **Hiding a page from the nav** moves the rows under the aim of someone who has just learned where they are, and it breaks the account menu: `settingsPanel.open` falls back to the first registered section when the id it was given is not there, so the Usage row would quietly open the Account page instead. **Leaving a page blank** is worse still — it reports an account with no allowances rather than no account.

The Account page keeps its identity header in those states too, drawn read-only: the mark shows a person glyph, the line says nobody is signed in, and neither the avatar trigger nor the name's pencil exists, because both would open a form whose Save has no account to reach. The activity strip stays, with every cell an em dash.

## The account gateway

The supplier does not exist yet: it will be a desktop BFF added to the UnieAI web product, reached with a bearer token obtained through a device-code sign-in. So this package defines the seam and renders the honest state on this side of it.

`UnieAiAccountGateway` is a `getSnapshot`/`subscribe` pair plus `signIn`/`signOut`/`saveProfile`, and an optional `sendInvite`. A composition supplies one as the `unieaiAccount` cordis service; `apply` reads it at composition time and adopts a later one through `internal/service`, wrapping either in `AccountSource`, which caches the snapshot so repeated reads keep one reference between changes. With no gateway the state stays `unavailable` — no endpoint is called, no identity is invented, no allowance number is fabricated, and a write reports failure rather than a change that never left the page.

`saveProfile` answers `saved`, or `failed` with an optional `reason`. The split is deliberate: the supplier owns WHICH refusal happened, because only it applied the rule, and this section owns the words, because a failed save is one line of its own form copy and it already ships that copy in every locale. The three identifiers it renders are `name-required`, `avatar-format` and `avatar-payload`; a refusal identified as something else, or not identified at all, falls back to the reference form's *update failed, please try again*. A `saved` result means the snapshot already carries the stored values, so the form never merges its own edit into the account it is drawing.

`sendInvite` is optional because it is a write and a supplier may expose only reads. It answers `sent`, `refused` with one of three identifiers the section has words for, `unsupported` when the deployment cannot send invites at all, or `failed`.

`UnieAiAccountState` keeps `unavailable` and `signed-out` apart because the user-visible difference is real: the first means no gateway is composed and a Sign in button would do nothing, so none is drawn; the second means one is composed and holds no session, so signing in is the screen's wanted action. There is deliberately no state between them and `signed-in`. The sign-in this product runs is a device-code flow the host renders server-side, so pressing Sign in navigates the browser out of the single-page app and the app that comes back is either signed in or not: a waiting posture is unobservable from inside the app, and the branch that drew one was unreachable in every composition.

## Invites

The product's referral model is one row per invited address, each with its own single-use code. There is no standing personal invite link, so the card offers none: what it shows is the rate-limit resets the account has banked, how many invites it has sent, those invites when the supplier lists them — each with its own link and a control that copies it — and a field that sends one more. Each part is drawn only where the supplier reported it, so an account whose referral call failed shows the parts that arrived rather than a zero balance nobody reported.

Credits are **visible but not spendable here**. The product grants a banked reset against the account; the desktop surface exposes no redeem route, and the card therefore reports the balance without offering to spend it.

## Styling

CSS Modules and semantic `--dsw-alias-*` tokens only. The sheet writes no literal colour and no brand hue: the one control the screen most wants pressed takes its weight from the `Button` primitive's `primary` family, which resolves to neutral ink exactly as the web product's own primary button does, and a spent allowance is drawn in `label-primary` because a usage bar reports a state rather than an action. Fills use `bg-module-platform` rather than a `bg-layer-*` name — layers 1 through 3 all resolve to the same white in the light palette, so a surface painted with one separates only under the dark theme.

## Model Experience

None, as the package contributes browser presentation only; the account gateway it reads owns every request and nothing here reaches a model.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **A composition may still ship no gateway** — `dsh-web-app` composes `unieai-account-gateway` ahead of this row, so the shipped desktop has a supplier; a composition that omits that row renders the not-connected card, which is an honest state rather than a stub.
- **Only the name and the avatar are editable** — the sign-in address and the plan are not, because the product changes neither from this surface.
- **An avatar cannot be removed, only replaced** — the reference form offers no remove control either, so neither does this one. The seam under it can express a clear (`image: null` on the wire), and a remove button would be the only consumer of it.
- **Only three refusals have words** — `name-required`, `avatar-format` and `avatar-payload` render as the reference form's own lines; any other refusal, and any supplier that identifies none, still shows the general *update failed, please try again*.
- **The crop needs a canvas** — a document that grants no 2D drawing context cannot produce the square, and the dialog reports a failed avatar rather than storing the uncropped original.
- **Banked resets cannot be spent from here** — the card reports the balance because the account has one; the product exposes no redeem route to the desktop, so there is nothing for a button to call.
- **The heatmap's five ramp steps are this sheet's own numbers** — the design platform names no five-step neutral ramp, so the percentages that mix ink into the empty cell's surface were chosen to keep five steps distinguishable in both palettes and are not a token anyone else can reuse.
- **The heatmap has no cell keyboard path** — a cell's day and token count live in its `title`, exactly as in the reference, so they are reachable by pointer and not by tab. The five totals above the grid carry the same year as text, and the month ruler under it is `aria-hidden` because it is a ruler; a focus order over 371 cells was not worth the tab stops.
- **Reset times and plan names arrive pre-formatted** — the supplier localizes them, so a locale switch does not restyle values already delivered.
- **The two new pages list outside the PERSONAL nav group** — `ui-settings-general` decides nav grouping from a literal id list (`NAV_GROUPS` in `src/client/SettingsRoot.tsx`), which names `unieai-account` and `general`. Ids it does not name still list, after every named group and under no heading, so `unieai-usage` and `unieai-invite` sit at the foot of the nav rather than beside Account. Their `order` values are already adjacent and correct; the fix is one line in a package this one does not own, and their nav glyph (that map's `navIcon`, which falls back to the settings gear for an unknown id) is the same call.
