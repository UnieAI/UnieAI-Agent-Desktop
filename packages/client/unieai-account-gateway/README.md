# @deepseek-ai/dsh-client-unieai-account-gateway

English | [中文](README.zh.md)

The Provider role of the account seam. `ui-unieai-account` defines `UnieAiAccountGateway` and draws the Account settings section over it; this package supplies one implementation of that service, filled from the sign-in gate's `/auth/account` route and writing through its `/auth/profile` route. A build that omits this row keeps the section, which then reports that no account service is connected.

## Where the figures come from, and why through the host

The credential that authenticates the UnieAI product's `/api/desktop/*` surface lives in the gate's session table on the host, and the browser session cookie is `HttpOnly`. Nothing in this package can read either. It issues one same-origin `GET /auth/account`; the host resolves the session, spends the API key against the product, and writes back an account description that carries no credential. The write takes the same path in the same direction: `saveProfile()` posts `/auth/profile`, and the host is what holds the key.

The FIRST read does not happen here at all. `@deepseek-ai/dsh-client-unieai-bootstrap` publishes the desktop's startup answer — one `/auth/bootstrap` body the host gathered before the application mounted — and this package takes its first account from that answer's `account` part, which is verbatim what `/auth/account` would have said. It reads the route itself only when there was no startup answer to be had (a build with no gate, or a host that did not answer in time) or when the account part was not among the gathered ones. Either way the read below is what happens afterwards.

The read happens once per document, plus once after each write. Both sign-in gestures end in a new document — `signIn()` leaves for the gate's server-rendered device-code page at `/auth/login`, `signOut()` posts `/auth/logout` and reloads — so the account is read again exactly when it can have changed. Sign-in cannot happen inside the single-page app: the gate renders that page before any client bundle exists, which is also why this gateway publishes no state between signed-out and signed-in.

## What it publishes, and what it refuses to

The account contract says the section renders what the supplier reports and nothing else, so the mapping is one-directional: every field written here comes from a field the product reported.

| Product meter key | Allowance id |
|---|---|
| `agentTurns` | `agent-turns` |
| `agentTokens` | `agent-tokens` |
| `chatTokens` | `chat-tokens` |
| `mcpCalls` | `mcp-calls` |
| `toolCalls` | `tool-calls` |
| `agentSessions` | `agent-sessions` |
| `vlmPages` | `vlm-pages` |

A meter the product did not report is absent from the list rather than present at zero, and an allowance the product calls unmetered keeps `limit: null` rather than collapsing into a full bar. `resetsAt` is formatted from the reported ISO instant into `YYYY-MM-DD HH:mm` in the reader's own time zone, and an unreported instant produces no reset line at all. `windowHours` travels as a number, because the sentence it appears in — *Resets every 5 hours · Next …* — is the section's own copy rather than an allowance name only the product can write; the wire spells an unreported window as `0`, which is not a window any allowance has, so it arrives at the section as absent and the line names only the instant. An account the product puts on no plan shows the section's own unknown mark rather than a tier nobody granted.

### The activity strip and the heatmap series

The contract makes the supplier format the five strip figures, because the five differ in unit and only the supplier knows which unit its number carries. This package is that supplier, so the formatting is here:

| Figure | Reported as | Rendered as |
|---|---|---|
| `total-tokens` | `totalTokens` | grouped digits (`1,204,567`) |
| `peak-tokens` | `peakDayTokens` | grouped digits |
| `longest-task` | `longestTaskMinutes` | whole hours and minutes with the product's own suffixes (`2h 5m`) |
| `current-streak` | `currentStreakDays` | a day span with the product's own suffix (`3d`) |
| `longest-streak` | `longestStreakDays` | a day span |

A figure the product did not report is left out of the map entirely, so the strip draws that cell as unknown; a figure it reported as zero is carried as zero, because a reported nothing and an unreported figure are different facts. The daily series travels as raw numbers rather than as text — the heatmap compares days against each other, so it needs the quantities — and a day with no usage stays absent from it rather than arriving at zero.

The three unit suffixes are the product's own `SettingsPage.profileStats` copy in all four shipped locales, so `2h 5m` and `3d` read identically on both surfaces.

### The referral standing

The product's referral model is one row per invited address. `inviteCredits` becomes the banked rate-limit resets, `inviteCount` becomes how many invites were sent, and the rows themselves — when the host forwards them — become the list, each with the invite's own single-use link, its creation time formatted like a reset time, and its state named in the reader's language. `pending`, `joined` and `rewarded` are the three states this build has words for; any other state is dropped rather than printed, because an English enum member is not a reading in any language. Reporting none of the three parts leaves the whole standing absent, which is what a deployment running no referral programme and a referral call that failed both look like.

Allowance names and both failure messages are already-localized text, as the contract requires, so this package owns them in all four shipped locales (`en`, `zh-CN`, `zh-TW`, `ja`). They are a plain table rather than a `ctx.locale` namespace, because they are data carried inside the account rather than the copy of a rendered slot. Switching language relabels the standing account without reading the host again: the figures are the product's and do not change with the reader's language.

`getSnapshot()` is a field read that returns the same object until the state actually moves — a second read that repeats the first publishes nothing and notifies nobody, which is what the section's identity-comparing render machinery requires. The avatar counts as part of that state, so a save that changed only the photo still moves it.

## Saving a profile

`saveProfile({ displayName, avatar? })` posts one change to `/auth/profile` and answers `saved`, or `failed` with the reason the host named. Four properties matter:

- **The avatar's three fields travel together or not at all.** An absent `image` is how the wire says *keep the stored photo*, so a name-only save carries no image field and cannot delete an avatar. A save that does carry one carries its MIME type and its extension too, because the product accepts either identification and cross-checks the data URL against the MIME type when one is given.
- **A stored change is followed by a re-read of `/auth/account`.** The product decides what it actually kept — a trimmed name, a re-encoded photo — so the section is republished with the stored profile rather than with what the page submitted. A refusal republishes nothing, because redrawing the same account would read as a save that worked.
- **The reason crosses the seam; the wording does not.** `failed` still carries no prose — the failure line is one line of the section's own form copy, which that package owns in every locale. What it carries is the host's `reason`, a stable identifier for WHICH refusal happened, exactly as a refused provider already travels through this gate. `name-required`, `avatar-format` and `avatar-payload` are the three this build reads; anything else is discarded and the form falls back to its general line rather than printing an identifier at a reader.
- **The body is read even when the status line is not 2xx.** A malformed patch comes back as `400` with the reason in the body, and dropping that body is exactly how a refused save used to reach the form with nothing to say.

Nothing here validates the patch. The product owns what a legal display name and a legal avatar are, and a second copy of those rules in the browser could only decide differently.

## Sending an invite

`sendInvite(email)` posts `{ email }` to `/auth/invite` and answers `sent` (with the invite's link when the host reports one), `refused`, `unsupported`, or `failed`.

A refusal arrives as the product's own identifier and is translated once, here, into the section's vocabulary: `invalid_email` → `invalid-email`, `self_invite` → `self-invite`, `already_invited` → `already-invited`. An identifier absent from that table is a refusal this build cannot put into words, and is reported as a plain failure rather than as an unnamed refusal.

`404` and `501` are read as `unsupported` rather than as a failure: a host with no invite route is a deployment that cannot send invites at all, which the card says once, instead of a send that failed and might work on a retry.

A sent invite is followed by a re-read of `/auth/account`, because the count and the balance the card shows are the product's. A refusal republishes nothing, for the same reason a refused save does not: redrawing the same account would read as an invite that worked.

## Composition order

Two edges, and they are of different kinds.

**Downwards, this package injects `unieaiBootstrap`** — a hard dependency, because it is an ordering one and `inject` is the only thing in Cordis that orders activation. The startup answer's supplier is still reading while every other plugin's body runs, and a service whose fiber is not active is not readable with `ctx.get`; a gateway that merely looked for it would find nothing, read `/auth/account` itself, and leave the gathered account unused. Waiting is also what makes this gateway's first published state the settled one. The two rows therefore ship together: dropping the startup row from a composition that keeps this one leaves this fiber pending, which the boot page reports by name.

**Upwards, `ui-unieai-account` depends on nothing.** The section reads this service with `ctx.get` while its own body runs and adopts a later one through `internal/service`, so it reaches this gateway however the two are ordered — and it now arrives through that late path as a matter of course, because this row waits for the startup answer and the section does not wait for anything. All of it happens before the application mounts, so nothing renders in between.

## Model Experience

None, as the package reads an account description for a settings surface; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The invite rows depend on a host that forwards them** — the product lists one row per invited address; the gate has always reduced that list to `inviteCount`. This package reads the rows when they arrive and shows the count alone when they do not, so the list appears the moment the host forwards it and nothing here fabricates a row in the meantime.
- **`/auth/invite` is this package's ask of the host** — the browser half posts it, reads its three refusal identifiers, and treats `404`/`501` as a deployment that cannot send. Until the gate registers that route, every send answers `unsupported` and the card says so in one line.
- **Tokens are grouped, not compacted** — the web product prints `1.2M` through `Intl.NumberFormat`'s compact notation; this package prints `1,204,567`, matching the account contract's own avoidance of host `Intl` data, whose output differs between a browser and a Node test run.
- **The zh-CN reset line is corrected, not verbatim** — the product's own `zh-cn` `meterReset` string is written in Traditional characters; the Simplified dictionary here spells it in Simplified, which is the one place this package's copy departs from the product's.
- **An unnamed account is titled by its address** — the contract's `displayName` is required and the product reports `null` for an account that set no name, so the address stands in. The section then shows the address twice, once as the heading and once as the address.
- **The reset time is not localized** — it is rendered as `YYYY-MM-DD HH:mm` rather than through `Intl`, matching the account contract's own avoidance of host `Intl` data, whose output differs between a browser and a Node test run.
- **The host's failure text is not surfaced** — `/auth/account` answers a failure with an English diagnostic for a direct caller. Only the browser knows the reader's language, so this package substitutes its own localized line and the two failure modes it distinguishes (the product would not answer; this host would not) are all the detail the section receives.
- **One read per document, plus one after each save** — there is no polling and no refresh gesture. A quota spent, or a profile changed, in another window is not reflected until the page is reloaded. The startup answer does not change that: it supplies the first account and, if a part arrived late, one warm follow-up; everything after it is this package's own read.
- **A startup answer cannot be told from a fresh read** — the account part the host gathered may be up to its cache lifetime old when this package adopts it (30 seconds, and in practice the seconds between a sign-in and the first frame). Nothing here distinguishes the two, because a gathered account and a just-read one describe the same product state at desktop startup.
- **Only three refusals have identifiers** — the product answers a rejected patch with English prose (`Name is required`, `Unsupported avatar format`, `Invalid image payload`), and the host is what turns those into `name-required`, `avatar-format` and `avatar-payload`. A refusal the product words differently reaches the form as a general failure.
- **The avatar is carried inline** — an avatar is a base64 `data:` URL in the account snapshot and in every save, so a large photo is re-sent on every read. The editor's 512px crop is what keeps that a few hundred kilobytes; a deployment that raises the crop size pays for it on every read.
