# @deepseek-ai/dsh-unieai-web-gate

English | [中文](README.zh.md)

The browser sign-in gate: the `/auth/*` routes, the server-rendered sign-in page behind them, and the `webServer` request guard that decides whether a request reaches dispatch at all.

Identity comes from the UnieAI Copilot web product over an RFC 8628 device-code grant. On approval the product returns one credential: an API key for its own `/api/desktop/*` surface.

The two products are deliberately separate. Copilot is a SaaS; this desktop is a personal application that runs its own agent locally, and it asks that product only for identity, plan, and model credentials. It accepts no work from it, so the login yields nothing that could let the product reach into this machine.

## Why the guard, and not a login screen inside the app

`client/runtime` opens the WebSocket downlinks and issues its first RPC during the plugin stage, before React mounts. Anything rendered after that is a curtain in front of a stage that is already running, and a non-browser caller never sees the curtain at all. The guard runs at the two dispatch heads instead, so one decision covers the application shell, the plugin-bundle registry, `/api`, and both downlinks.

## Authentication is not authorization

This host runs one agent holding `bash` and the filesystem tools, so admitting every valid account would hand arbitrary code execution to anyone who can register with the product. Identity alone therefore does not admit: the first account to complete a sign-in claims the instance and later accounts are refused, unless `allowedUserIds` names them explicitly. There is deliberately no mode in which any account passes.

## The startup route

`GET /auth/bootstrap` is the desktop's startup answer: everything a freshly loaded application needs about its account, in one body, gathered on this host.

It exists because the browser used to ask four separate questions — the account, the providers, the entitled models, the mountable MCP servers — each on its own route, each on its own schedule, and each turning into one or more product calls once it arrived here anyway. Gathering on this side is strictly better for two reasons that are facts about where things are rather than preferences: this host already holds the session and the API key, and it can start before the browser exists. The gather begins the moment a device grant lands, which is while the browser is still navigating from the sign-in page to the application.

The answer is `{ status, parts, pending }`. Each part is **verbatim what that part's own route would have answered** — `parts.account` is an `/auth/account` body, `parts.providers` an `/auth/providers` body, and so on; the same functions build both, so the two cannot drift. `status` is `ready` when every part is present and `partial` when at least one is not, with `pending` naming those. A part that reached the product and failed is a PRESENT part carrying that route's own failure body: a gathered failure and a part that never landed are different facts, and only the second is `pending`.

| Bound | Value | What it does |
|---|---|---|
| Answer deadline | 2s | The longest a cold gather is waited for. Past it the route answers what has landed and keeps gathering the rest. |
| Cache lifetime | 30s | How long a completed gather is answered from memory. It covers one navigation, not a data store. |
| Upstream ceiling | 15s | When a product read that never answers is abandoned, so a dead socket is not held open on the account's behalf. |

Three things it deliberately does not do. It never consults the cache for a request without a live session — the session is resolved first, so a lapsed one answers `signed-out` whatever was gathered. It never hands one account what was gathered for another — the cache is keyed by account id and dropped when the last session for that account goes. And it never serves the individual routes: `/auth/account` and `/auth/providers` are the REFRESH paths, read after a save or a create, and answering those from a cache would report the state the reader is trying to move past.

A browser with no session costs nothing at all: no product call, no waiting, `{ status: 'signed-out' }`. That matters more than it looks — signed out is a normal way to run this desktop, and the local agent does not need the product.

## The account route

`GET /auth/account` is the one route that exists for a reason other than signing in. The Account settings section needs the person's plan and remaining usage, and the credential those calls need is the API key held in this gate's session table. The key must not reach a page, so the browser asks this host and this host asks the product: the route resolves the session, calls `/api/desktop/me`, `/usage`, and `/invite` with the key as a bearer, and answers `{ status: 'signed-out' }`, `{ status: 'signed-in', snapshot }`, or `{ status: 'failed', message }`. The key appears in none of them.

The failure `message` is English. This host does not know the reader's language, so it is a diagnostic for a direct caller; `@deepseek-ai/dsh-client-unieai-account-gateway`, the browser half that consumes this route, substitutes its own localized line.

The snapshot's `user.avatarUrl` comes from the profile route below, not from `/api/desktop/me`, which reports no photo. An account with none arrives without the field, because an empty `src` renders as a broken image while an absent one draws a monogram.

The snapshot also carries `stats` — the five Overview figures and the day series behind the heatmap — read from `/api/desktop/stats` in the same call. It rides here rather than being left to `/auth/stats` alone because the browser's account gateway reads one endpoint: a figure that does not arrive in this answer is a figure the Overview strip cannot draw. Like the other additive sections, a failed read leaves it ABSENT rather than zeroed, because zeroes are a claim about an account and an unanswered product is not one.

`invites` carries the referral rows themselves — `inviteeEmail`, `status`, `createdAt`, `inviteUrl` — beside the `inviteCount` that has always crossed, from the same `/api/desktop/invite` call and at no extra cost. Each row is built by name, so a column the product adds later has nowhere to land; `inviteUrl` is forwarded deliberately, because a redemption link is the product of the operation and what the person is meant to pass on, not a credential this desktop holds on their behalf.

## The profile route

`GET`/`POST /auth/profile` is the same seam for the display name and the avatar, and it is what makes the desktop's Account section able to change them rather than only show them. `GET` proxies `/api/desktop/profile` and answers `{ status: 'signed-out' }`, `{ status: 'signed-in', profile }`, or `{ status: 'failed', message }`; `POST` proxies that route's `PATCH` and answers `{ status: 'saved', profile }` or `{ status: 'failed', message }`. As on `/auth/account`, the session's API key appears in none of them and is spent only towards the product.

Four properties hold here:

- **The save reports what was stored, not what was asked for.** A `POST` that the product accepts is followed by a read-back, so a trimmed name or a re-encoded photo reaches the page as the product kept it.
- **A refusal names itself.** The product rejects a `PATCH` with an English sentence written for a direct caller, so the gate recognises which of its three checks failed and answers `{ status: 'failed', reason }` with `name-required`, `avatar-format`, or `avatar-payload` — the `/auth/providers` discipline, for a route whose refusals arrive as prose instead of codes. The gate's own shape refusal for a body naming no display name uses the same `name-required`, so which side noticed is not something a reader has to learn. A sentence this build cannot place stays an unexplained failure rather than being guessed at.
- **The avatar's three intents stay distinct.** A `data:` URL sets the photo, `null` clears it, and an absent `image` leaves it alone. Collapsing absent into null would delete an avatar on every name-only save.
- **Nothing here validates the patch.** What a legal display name and a legal avatar are is `app/api/desktop/profile`'s decision, and a second copy of those rules on this host could only disagree with it.

The one bound this route adds of its own is a buffering limit on the request body (12 MiB), because an avatar travels inline as base64. The product bounds no image size, so this is a transport limit rather than a validation rule — it is set an order of magnitude above what the desktop's own 512px crop produces.

## The providers route

`GET`/`POST /auth/providers` is the same seam for the account's API Providers, and it is where the desktop shows the same list the web product's "API Provider Settings" page shows. `GET` proxies `/api/desktop/providers` and answers `{ status: 'signed-out' }`, `{ status: 'signed-in', providers }`, or `{ status: 'failed', message }`; `POST` proxies the create and answers `{ status: 'created', provider }` or `{ status: 'refused', reason }`.

`PATCH`/`DELETE /auth/providers/<id>` is the same seam for one row: a prefix route beneath the exact collection path, proxying `/api/desktop/providers/<id>` and answering `{ status: 'updated', provider }`, `{ status: 'deleted' }`, `{ status: 'refused', reason, fields }`, or `{ status: 'failed', message }`. Any other verb is a 405 and a deeper path a 404, so an id is always one segment.

Two rules hold on these routes and are tested against the whole serialized answer. The session's API key never appears in one, as on `/auth/account`. And no provider's own credential ever travels back: the product's desktop projection carries none for any row, and `ProviderSummary` has no field for one. A credential moves in one direction only — a `POST`, or a `PATCH` whose `apiKey` the person just retyped, carries the key towards the product, which is the store that will spend it. A `PATCH` that names no `apiKey` sends none, because absence is what tells the product to keep the credential it already holds; sending an empty string would erase it on a rename.

`reason` is forwarded verbatim as the product's own identifier (`prefix_taken`, `byo_provider_limit_reached`, `managed_provider_readonly`, `not_found`, ...), not as prose, because only the browser knows the reader's language, and `fields` carries the offending field names beside it. What a platform-managed row may change — its per-model selection and its enable flag, and never a delete — is decided in the product, beside the row; this host keeps no second copy of that rule and forwards the 409 that enforces it.

## The models route

`GET /auth/models` is the same seam for the models the account is entitled to run on the web product: the union its own picker is built from — the account's selected personal-provider models, the models its groups grant, and the global models. It proxies `/api/desktop/models` and answers `{ status: 'signed-out' }`, `{ status: 'signed-in', models }`, or `{ status: 'failed', message }`. As on `/auth/providers`, the session's API key appears in none of them, and no entry carries a provider credential — `EntitledModel` has no field for one, nor for an endpoint.

**These models are runnable, but not from here.** No entry carries the provider's base URL or credential, and it never will: those live on the product. What makes the list more than an account-visibility surface is the product's own relay, `POST /api/desktop/v1/chat/completions`, which the desktop API key authenticates and which resolves the upstream, enforces the plan's quota, and meters the turn on the product's side. `@deepseek-ai/dsh-llm-unieai-cloud` reads the same list through `ctx.unieaiGate` and registers it as one `llm` route pointed at that relay, so an entitled model becomes selectable exactly when a gate session exists to authenticate it.

Read-only by design: there is no write direction at all. Which models an account may run is decided by its providers, its groups, and the platform, and none of those is something a desktop changes by naming a model.

## The invite route

`POST /auth/invite` sends one referral invite: the body is `{ email }`, and the answer is `{ status: 'sent', url? }`, `{ status: 'refused', reason }`, `{ status: 'failed' }`, or `{ status: 'signed-out' }`. `reason` is the product's own identifier (`invalid_email`, `self_invite`, `already_invited`), forwarded verbatim so a reason this build does not recognise still reaches a page that might.

There is deliberately no `GET` half. The invites an account has already sent ride on `/auth/account`, which the browser is already reading for the balance and the count, and a second list route would be a second source for the same rows.

Nothing here decides what a legal address is, or which address is the account's own. Those are the product's rules; the gate refuses only a body that names no address at all, and reports it as the product's own `invalid_email` so the page has one line for it either way.

## The stats route

`GET /auth/stats` is the same seam for the account's personal activity, and it serves the whole record `/auth/account` carries a copy of: `totalTokens`, `peakDayTokens`, `longestTaskMinutes`, `currentStreakDays`, `longestStreakDays`, and `daily` — days with usage, ascending, a day with none absent rather than zero. It proxies `/api/desktop/stats` and answers `{ status: 'signed-out' }`, `{ status: 'signed-in', stats }`, or `{ status: 'failed', message }`. The session's API key appears in none of them.

Personal scope only, matching the product route: the web product's own `/api/user/stats` also carries an organisation panel, and this desktop has no organisation surface.

## The MCP route

`GET /auth/mcp` lists the MCP servers the account may mount. It is the one `/auth/*` route whose answer is a deliberate NARROWING of what the product sent, because the product sends a credential here: each server carries a per-user bearer, minted fresh on every read and good for about an hour.

The browser gets `McpServerView` — `id`, `label`, `origin`, `expiresAt`, `tools` — a type with no `token` member at all, on the same principle by which `lib/desktop/providers.ts` withholds `apiKey`: a future edit that wanted to send the bearer would have to add the field first, which is a change a reviewer sees. The endpoint is narrowed to its origin for the product's own reason for publishing MCP entries that way — a remote MCP URL routinely carries a token in its path or query.

`expiresAt` does travel, because it is a fact about the server rather than a credential: a plugins page showing a server as connected after its grant lapsed would be showing something that is no longer true.

## The host-side gate service

`ctx.unieaiGate` is the gate's other half: not a route, but the seam by which host plugins act on the signed-in account's behalf. It exposes `productUrl`, `session()` — the account and its API key — and two proxied reads, `mcpServers()` and `entitledModels()`, which return what the product sent BEFORE the browser projection narrows it. `@deepseek-ai/dsh-unieai-mcp-supervisor` mounts the account's MCP servers through the first; `@deepseek-ai/dsh-llm-unieai-cloud` builds the account's runnable model route on the second.

The service exists because the session table is the only place on this host that holds a product credential, and a host plugin that needs one must not reach into that table. `unieai-gate/session` is emitted when a sign-in produces a session and when the last one is lost to a sign-out — not when a session lapses on idleness, which is evaluated on read and therefore observed by nobody at the moment it happens. A consumer holding something on the account's behalf re-reads on its own schedule.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `productUrl` | `https://agent.unieai.com` | The web product this desktop signs in against. |
| `enforce` | `false` | Whether the guard refuses traffic. Off by default so a composition can mount the gate and exercise the flow at `/auth/login` before committing to it: turning a half-verified fence on by default locks an operator out of a working machine. |
| `allowedUserIds` | `[]` | Accounts admitted. Empty defers to `claimFirstLogin`. |
| `claimFirstLogin` | `true` | Whether an empty allowlist is claimed by the first successful sign-in. |
| `idleTimeoutMs` | 12 h | Idle lifetime of a browser session. |

## Model Experience

None, as the package gates browser traffic and serves a sign-in document; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Sessions live in memory** — a host restart signs every browser out. A desktop serving one operator re-authenticates in one gesture, so durable storage is deferred until a deployment needs sessions to survive a restart.
- **`enforce` defaults to off** — the fence ships mounted but open, and a deployment that wants it closed sets the flag. This is a deliberate staging choice, not a recommendation: a reachable instance with `enforce: false` is protected only by whatever sits in front of it.
- **The sign-in page restates its design values inline** — it is served to visitors who may not reach the plugin registry, so it cannot import `ui-theme`. It follows the shadcn/ui `LoginForm` block, whose Tailwind classes are resolved to literal values because this repository ships neither Tailwind nor a component library; that palette and those metrics are duplicated there and must be updated with the theme. The block's email field, per-provider buttons, and terms line are deliberately absent — the desktop holds no user database, provider choice happens on the web product's own page, and this deployment publishes no terms page to link to.
- **`/auth/account` reads the product on every call** — there is no cache and no revalidation window, so a browser that reloads repeatedly makes the same four product calls each time. A cache would need an invalidation rule this deployment has no source for. `/auth/bootstrap` is the one exception, and it is bounded to the seconds around a startup rather than being that missing rule.
- **The startup gather runs whether or not anyone reads it** — a sign-in warms the cache immediately, so a device grant that is never followed by an application load still costs one fan-out of product calls. It is one per sign-in, not per request, and it is what makes the read that normally follows free.
- **A startup part can be up to its cache lifetime old** — a reload within 30 seconds of a gather is answered from memory, so a quota spent in another window in those seconds is not reflected. The surfaces' own refresh reads are unaffected; only the startup answer is.
- **The startup answer has no push half** — nothing tells a browser that a part it was still waiting for has landed. The client asks once more, on its own schedule, and after that the part belongs to its own surface's retry gesture.
- **A profile save costs two product calls** — the `PATCH` and the read-back that reports what was stored. The product's `PATCH` answers with the name and image it kept but not the address, so answering from it alone would give the page a partial profile.
- **The product's rejection reason is dropped** — `app/api/desktop/profile` refuses with English prose (`Name is required`, `Unsupported avatar format`), which is a diagnostic for a direct caller, so this route answers its own English diagnostic and the browser half localizes it. A structured reason code, as `/auth/providers` forwards, would need the product to publish one.
- **The 12 MiB body limit is this host's alone** — the product bounds no avatar size, so a picture between that limit and whatever the product would accept is refused here and nowhere else.
- **`/auth/models` itself feeds nothing** — the browser route is a visibility surface; the model route that makes these entitlements runnable reads the same list through `ctx.unieaiGate` instead, because a host plugin cannot present a browser cookie. The two therefore read the product separately and can disagree for as long as one of their refresh windows.
- **`/auth/models` reads the product on every call** — like `/auth/account`, with no cache and no revalidation window.
- **An unrecognised profile rejection loses its reason** — the gate matches the product's three rejection sentences to name which refusal happened, so a fourth check added on the product, or a reworded sentence, reaches the page as an unexplained failure until this list is updated. The product publishes no code for these, which is why it is prose that is being matched.
- **`/auth/invite` reports the send, not the list** — the rows it adds to are re-read from `/auth/account`, so a page that wants to show the new invite has to re-read the snapshot.
- **`/auth/stats` and `/auth/mcp` read the product on every call** — like `/auth/account`, with no cache and no revalidation window. `/auth/mcp` is the more expensive of the two: every read mints fresh bearers on the product, so a page that polls it is minting credentials it never uses.
- **`/auth/mcp` reports grants, not mounts** — it answers what the product would let this account mount, which is not necessarily what this host actually has open. A server the MCP supervisor skipped or failed to connect looks identical here to one that is serving tools.
- **Idle expiry is lazy** — a session's idle lifetime is evaluated when the session is read, so `ctx.unieaiGate` neither notices nor announces the moment one lapses, and `unieai-gate/session` is not emitted for it.
- **No refresh or revocation of the API key** — it is held for the session's lifetime and dropped on sign-out; renewing it before expiry is deferred to the account surface that consumes it.
