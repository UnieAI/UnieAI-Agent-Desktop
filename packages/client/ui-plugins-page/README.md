# @unieai/uad-client-ui-plugins-page

English | [中文](README.zh.md)

The **Plugins** surface: the view the sidebar's Plugins row opens in the frame's main area, holding the first-party **UnieAI Studio** entry, the product's installable **plugin directory**, a **skills** destination, the UnieAI account's **Studio MCP** servers, this build's read-only **plugin inventory**, and this deployment's **cordis plugin registry**.

## Why it exists

The word "plugin" meant two different things in this product, and the sidebar row promised the wrong one. In the UnieAI Copilot web product, Plugins is a destination: bundles and MCP servers an account installs. In this desktop, Plugins was the cordis registry behind a settings section — real, useful, and developer-facing. Pressing the sidebar row opened the second while the label promised the first.

Both are areas here now, and neither owns the word alone. Nothing was rewritten to achieve that: the cordis surface is still `ui-settings-plugins`' own component, its own tabs, and its own cards; it moved from the `settings.section` seat to this page's `plugins.page.area` seat, which is the same shape of seat on a different surface.

The settings shell's own Plugins nav row disappeared without being touched. It renders only while a `plugins` settings section is registered, and after the move none is — so the two rows can never appear together and [`ui-settings-general`](../ui-settings-general/README.md) needed no edit.

## What it is, structurally

One `shell.overlay` entry, which is the only additive root seat the frame documents. That layer spans the whole app box, so the surface offsets its own left edge by `--dsh-shell-sidebar-width` — [`ui-layout`](../ui-layout/README.md)'s `SIDEBAR_WIDTH_PROPERTY`, the frame's *rendered* column width, published as an inline custom property on the frame element. The navigation column therefore stays visible at every width, through a drag, and through the narrow-viewport auto-collapse, and its Plugins row stays the marked one while the reader is here. A destination reached from the sidebar has to leave the sidebar standing: the row that says where you are is also every place you might go next.

The surface still carries its own way out — the close control in the chrome, Escape from anywhere on it, and the sidebar row itself, which toggles. The row is the reference's own way back; the close control exists because the rows beside it switch sessions *underneath* this surface rather than closing it.

It declares one hole, `plugins.page.area`: a root-scoped list whose owner supplies nothing, so an area draws its own heading, its own intro, and its own body. Adding an area to the page is a registration, not an edit here. This package registers the UnieAI Studio entry at order -20 under the entry id `unieai-studio`, the plugin directory at order -10 under `unieai-directory`, Studio MCP and the skills area at order 0 under the ids `studio-mcp` and `skills`; [`ui-settings-plugin-inventory`](../ui-settings-plugin-inventory/README.md) registers the cordis inventory at order 5 under the id `plugin-directory`; `ui-settings-plugins` registers the cordis registry at order 10. The two ids are confusingly close and must stay distinct: a list slot holding two entries with one id refuses to load rather than shadowing one with the other, which takes the whole app down at boot.

The surface owns ONE reading measure, centred at 980px, and every area inherits it. It is set here rather than in an area because an area that centred itself while its neighbour ran full width would put two column edges on one surface. The main area itself stays full width — this is a destination, not a dialog — and the chrome row (the destination pills on the left, re-read / configuration / close on the right) sits outside the measure, because it belongs to the surface rather than to the text.

## Three destinations, two on the strip

Each occupant is a place of its own, and stacking them made the surface a scroll in which the directory's 22 rows and the Loader's 128 sat end to end with nothing saying they were different kinds of thing. One destination renders at a time, addressed by entry id through `renderSlot(..., { only: id })`.

Two of them are places a reader **browses**, so they are the pill tabs at the top left: the plugin directory, and skills. The third is what the deployment already **is** rather than what can be added to it — the account's connected MCP servers, the Loader's inventory, and this build's cordis configuration, stacked in `order` — so it hangs off the gear at the top right, where the reference design puts configuration, and the gear marks itself while its destination shows because no pill can. Pressing it a second time returns.

The loaded-modules area is **off by default** (`showLoadedModules`, a `Config` field a deployment sets in its own patch layer). Nothing on it can be acted on: the host's inventory service is read-only and cannot enable, disable, add or remove anything. A reader who opens Plugins is looking for what they can install, and a list of engine parts they cannot touch — under a similar word — reads as a broken control rather than as a report. It is also why it says "Loaded modules" and not "Deployment plugins": the word "plugins" already means the installable kind here.

The destination table lives in the surface component and names entry ids from other packages, which is the one place this surface knows its occupants. That coupling is deliberate and partly gated: `plugins.page.area` carries no per-entry label, so a generic strip would have nothing to write on itself, and a test asserts that every area *this package* registers is listed by exactly one destination — an area added without one fails there rather than never rendering. The two ids from other packages (`plugin-directory`, `cordis-plugins`) are outside that gate's reach.

## UnieAI Studio: the one entry this page states rather than reads

Everything else on this surface is a wire. The directory renders whatever `/auth/plugins` lists, the Studio MCP area renders whatever `/auth/mcp` lists, and neither component names a plugin — a hardcoded row would be this package asserting that something exists in a catalogue the product owns.

**UnieAI Studio is the deliberate exception, and only its existence is fixed.** It is not a catalogue row: it is this product's own account link, the one that supplies the Studio model catalogue, the account's own runtime key, and the Studio MCP tools this page already draws further down. That link either exists for an account or does not, in every deployment, so stating the entry asserts nothing about anyone else's catalogue. Everything it *displays* is read: the binding, the tool names, and whether there is an account at all all come from the same `StudioMcpSource` the Studio MCP area binds — one source object, injected into both entries, so the two can never disagree.

**Bound is decided by the product's own answer, not by a flag.** `/auth/mcp` forwards `GET /api/desktop/mcp`, which lists a server with the id `unieai-studio` only for an account that holds a Studio link. So the presence of that row *is* the binding, and its absence from a **settled** list is an unbound account rather than a failure — which is why `unbound` is derived only from `ready`, and the four readings that carry no list (still reading, no session, no MCP route, unreadable) each keep their own name and their own sentence. A signed-out desktop is neither bound nor unbound and says so.

**The action appears for exactly one reading.** Bound draws the connected word and the tool names the account's own server reported; unbound draws **綁定** / Bind. Signed out asks for a sign-in instead, because binding is an account link and the button would land on a login. A failed read offers the retry, which is the only one of these a retry can fix.

Binding itself happens entirely on the web product — `components/settings/studio-link-card.tsx` runs an OAuth device grant against Studio — so the action is an `<a target="_blank">` to the product's own settings page, deep-linked to the Profile tab that holds the binding card. See [Known Limitations](#known-limitations-and-deferred-work) for what that URL cannot yet know.

The mark is a 754-byte pixel-art PNG inlined as a `data:` URI in `studio-entry.ts`. Inlined rather than fetched because the client bundle purity gate forbids reaching outside the package for a runtime asset, and because the desktop runs offline against a local harness — a remote image would break exactly when the network is what failed. It is drawn in a 40px tile with `image-rendering: pixelated`, since every default smoothing filter turns the source's one-pixel edges into grey fringes at that size.

## The directory: the product's catalogue, as something to choose from

A directory answers "what could I add", which is a different question from the cordis inventory's "what is loaded", and the two want opposite layouts. The inventory is read by whoever maintains the deployment and wants density and identifiers; the directory is read by someone deciding, and wants a name, a sentence in their own language, and one control. So the area reads top to bottom as one question narrowing: the search field across the full measure, then what this account already installed as a strip of 44px marks, then the filters, then the catalogue two rows to a line — each row a mark, a name, a one-line description, and one control. That control is the word **Install** on a filled pill while the row is not installed; once it is, the only remaining action is removal, and removal standing open on every row a reader already chose is an invitation to undo them, so it folds behind the `…` overflow the reference draws.

Rows come from `/auth/plugins` and nothing is shipped in this build: a plugin the product adds appears on the next read, with no desktop release. Grouping is the product's too — `category` arrives on each row from the plugin's own manifest, and a heading is drawn for each value present. There is deliberately no "Featured" run: an editorial group with nothing behind it would be this package asserting a judgement the catalogue never made. A row whose manifest names no category collects under one trailing heading, and that word is a dictionary key rather than a value from the wire, because "the manifest named none" and "the product filed it under other" must stay distinguishable.

The filter segment stands where the reference design puts a public/personal pair. **No field on the wire distinguishes those two**, so what stands in that position is what the catalogue can actually answer: everything, what this account installed, and one pill per publisher present. The publisher pills are derived from the rows, so a publisher the product adds tomorrow gets a pill without a release; only two stand before the rest fold behind More, because past three the segment wraps onto a second line and stops reading as one control. The chosen pill always stands, even past the cut: a filter that cannot be seen cannot be turned off.

A write does not flip its own row. The product decides what installed means — which version was bound, whether a policy downgraded the request — so an install re-reads the catalogue and the row moves on the answer. `canInstall` is reported beside the rows rather than on them, because it is a property of the reader: a free account sees the whole catalogue and may install none of it.

## Skills: a destination with nothing this build can list

The skills destination draws its title, its one-line intro, and a sentence saying this build has no account-level skill catalogue. It draws no search field, no segmented control and no rows, because **there is nothing to put in them**. A skill in this product belongs to the project a session runs in, and the only enumeration on the wire is `skill.list`, addressed by `sessionId` (`packages/host/apiproxy/src/api/skills.ts`); this surface is root-scoped and opens with or without a current session, so there is no session to address. Nothing reports installed, personal, system or recommended skills at all.

It is a registered `plugins.page.area` entry (`skills`) rather than a branch inside the surface component, so the day a root-scoped catalogue exists that entry is replaced by one that reads it and nothing about the surface changes.

## Studio MCP: it lists what the account has connected

The area reads `GET /auth/mcp` through the sign-in gate, the way [`ui-unieai-providers`](../ui-unieai-providers/README.md) reads `/auth/providers`. The gate forwards the product's `GET /api/desktop/mcp`; the API key that authenticates that surface lives in the gate's session table on the host and must never reach a page, so the browser asks the host and the host asks the product.

What comes back is a listing and nothing more: `{ servers: [{ id, label, origin, expiresAt, tools }] }`, where `tools` is a list of names. It publishes a server's **origin**, never a full URL, and it carries **no token** — by design, because a remote MCP URL routinely holds a credential in its path or query, and the bearer that reaches the product stays host-side. The area therefore draws a name, an origin and a tool catalogue, and offers no install, connect, edit or delete control: the browser has nothing to dial with, and a control that cannot work must not be drawn. Adding, editing and removing happen in UnieAI Studio, which the area says in as many words.

`expiresAt` is on the wire and is deliberately dropped here. It describes how long the *host's* token stays good; the browser never holds that token, and no gesture on this page becomes possible by knowing when it lapses. A countdown or a refresh control built on it would be decoration over someone else's clock.

`StudioMcpRow` has no `url` and no `headers` member, and the reader builds every row field by field from an allowlist instead of spreading the wire object. Both are deliberate, and they are the same guarantee stated twice: a host that starts sending a credential reaches neither the state nor the DOM until someone edits that type and reads this section. A test asserts it in the rendered DOM as well as in the type.

### Four answers that have to stay four

- **404 is `unsupported`.** A deployment older than the route serves no MCP surface at all, and telling that reader a read failed would suggest a retry is worth something. It is not, so none is drawn.
- **401, or the gate's signed-out envelope, is `signed-out`.** There is no account to list servers for yet.
- **A 5xx, an unreachable host, or a body this build cannot parse is `failed`.** This is the one answer a Retry can fix, and the only one that offers the control.
- **`{servers: []}` is `ready` with nothing in it.** A real answer about a real account, said in words rather than by drawing nothing.

An empty list that actually means "we never asked" is the failure mode this area exists to avoid. The listing is recognised by its `servers` array rather than by an envelope tag, so the product's own `{servers: []}` and the gate's `{status: "signed-in", servers}` are one answer here.

### The tool is the unit; the server is the category

A reader comes here to find out which tools they have. So the tool is what gets a card, and the server is the heading those cards sit under — its name, its origin beside it, and a rule underneath. The server is no longer a box of its own: boxing it stacked a second border around content the page already framed, and pushed the catalogue — the answer — into a narrow well. Nothing is capped either. Every tool the catalogue reports gets a card, because a cap turns "what does this server give me" back into a count.

**The server is the category because it is the only grouping that is real.** The wire reports a label and an origin per server, and per tool it reports a name. A finer grouping would have to be cut out of those names — `studio_kb_*` against `studio_sql_*` — and that is a convention one server happens to follow, not a fact it published. The same rule turns a Notion catalogue's `search` and `fetch` into two categories of one apiece, or drops the whole catalogue into an "other" bucket. Segmentation dressed as taxonomy reads to a user as fact, and this one would be a guess.

**A card wants a sentence, and the host does not send one yet.** `lib/studio/mcp-tools.ts` writes a description for every Studio tool; `lib/desktop/mcp.ts` reduces the list to `STUDIO_MCP_TOOLS.map((tool) => tool.name)`, and the gate's `McpServerView` types the field `string[]`, so both hops drop it. `StudioMcpTool` here carries `description` and reads it from either wire shape — a bare name, or `{name, description}` — so the sentence appears the day the host forwards it and no page release is needed in between. Until then a card is its name and nothing else: this package invents no description and draws no "no description" placeholder, because a line about the host's silence says less than stopping.

## Copy

Every line whose text the web product already publishes is copied verbatim from its `messages/{en,zh-tw,zh-cn,ja}.json`, with the source namespace and key named beside it in [`src/client/locales.ts`](src/client/locales.ts). All four shipped locales carry a complete dictionary; this package's own words are the UnieAI Studio entry's lines and the states the web page cannot be in — no session, a deployment older than the MCP route, a list still loading — and the two lines naming an unnamed server and an unreported origin. There is deliberately no key for a tool that reported no description.

## Styling

CSS Modules and semantic `--dsw-alias-*` tokens only, with no literal colour, no fallback value, and no brand hue. The nav row draws the shell's own row geometry, because `sidebar.nav.action` holds no state for its occupants. Server origins and tool names are set in the code face, because both are values people compare character by character or retype.

The tool grid is `repeat(auto-fill, minmax(min(232px, 100%), 1fr))`. The `min(…, 100%)` floor is load-bearing, not decoration: the page runs the full frame width, and a bare `232px` floor overflows its container the moment the frame is narrower than one track, which would scroll the whole page sideways at 390px.

A tool card is filled rather than outlined, on `--dsw-alias-bg-module-platform`, and takes `--dsw-radius-control` rather than `--dsw-radius-card` — at tile size the card radius reads as a blob. `--dsw-alias-bg-layer-1` is unusable for a card on this page: the light palette resolves it to the same value as `--dsw-alias-bg-base`, which the page paints, so a fill-only card using it would exist in dark and vanish in light. A test asserts both choices against the stylesheet.

## Model Experience

None, as the package contributes browser presentation only; neither area reaches a model request.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **The bind action always points at `https://agent.unieai.com`, even on a deployment that repoints `productUrl`.** The path is confirmed — the product's settings page holds the binding card on its Profile tab, and `settings-client.tsx` deep-links tabs by hash — but the origin is a constant, because no route this browser may call reports the configured product origin. `/auth/mcp` publishes a server's origin only for servers an account already has, which is by definition not the unbound account the action is drawn for. Closing this needs the gate to publish its `productUrl` to the browser, which is a `unieai-web-gate` change and not a page change; a self-hosted copilot-v2 (docs/unieai-development.md) currently sends this one link to the public product.
- **Listing is not connecting, and this desktop still cannot connect.** The answer carries the server's origin and no endpoint or credential, by explicit design; the stored headers and OAuth bearer are decrypted server-side and never projected to a client. Connecting therefore needs either a product-hosted relay the desktop can dial with its own key — which is what [`@unieai/uad-mcp-client`](../../mcp/mcp-client/README.md) already supports, as a `streamable-http` server with an `authorization` header — or a decision to send MCP credentials to a laptop, which contradicts how this desktop handles every other credential. Both are outside this package.
- **Nothing in this repository mounts a listed server.** `mcp-client` mounts one server per static config row with a compile-time-unique name; turning a live list into live connections needs a supervisor that mounts and disposes plugins as the list moves, and no such component exists here. Until one does, this area is a window onto the account's Studio and not a source of tools for a turn.
- **A deployment older than the route still shows `unsupported`, and still logs one 404 per page open.** The state and its copy are kept for exactly that deployment. The console line is the visible cost of asking a route that may not be there, and asking is what makes the area light up with no further change in the browser.
- **Tool cards carry no description, because two host hops drop it.** The product writes one per Studio tool in `lib/studio/mcp-tools.ts`, and it is discarded twice on the way here: `lib/desktop/mcp.ts` publishes `tools: STUDIO_MCP_TOOLS.map((tool) => tool.name)`, and `web-gate`'s `McpServerView.tools` is typed `string[]` and copied through `readTools`. Filling the cards needs both changed to carry `{name, description}` — the product route and the gate's grant/view pair — and neither file is this package's. The browser half is already done and tested: a described entry renders, a bare name still reads, and nothing here fabricates a sentence in the meantime.
- **The area cannot tell a disabled server from an enabled one.** The browser-facing contract reports no enabled flag and no ownership scope, so the row shows neither rather than guessing; a reader who needs that distinction reads it on Studio.
- **No product serves `/auth/plugins` yet, so the directory reads `unsupported` in every current deployment.** The browser half is complete and tested against the catalogue's own rows; what is missing is `/api/desktop/plugins` on the web product, which today answers 404 while `/api/desktop/mcp` and the rest answer 401. The response fields the source reads are fixed and documented in `directory-source.ts`, so shipping that route is the only remaining step.
- **The directory shows plugin names exactly as the catalogue stores them.** Most are slug-style (`gl-reconciler`, `kyc-screener`) and only `text-transform: capitalize` separates them from their identifiers, which renders `Gl-Reconciler`. Rewriting them in the browser would be this package inventing product names; the fix belongs in the catalogue.
- **No publisher in the catalogue has uploaded a mark, so every row draws initials.** `iconUrl` is read and rendered when present — the column exists on the product side and is stored `NOT NULL DEFAULT ''` — and the initials tile is neutral for every row on purpose: a colour per plugin would be this package inventing brand identity for someone else's product.
- **The surface sits beside the sidebar by offsetting itself, not by occupying a main-area seat.** The frame declares no slot for the main area alone: `conversation` is a `single` seat ui-conversation occupies, and taking it would delete the conversation surface. So the surface stays a `shell.overlay` occupant and offsets its left edge by the frame's published column width. The visible cost is the sidebar drag handle, which straddles the column border and whose inner half the surface paints over while open.
- **The reference's Add (`新增 ⌄`) control is not drawn, because nothing on this host can add anything.** The gate serves no create route for a plugin, and the Studio MCP area is read-only by design — servers are added in UnieAI Studio. A menu button whose every item would refuse is worse than no button, so the chrome carries re-read, configuration and close instead.
- **The reference's per-section gear beside the Installed heading is not drawn.** It would reach the same configuration destination the chrome's gear already reaches, and two controls for one destination on one screen is a choice with no difference behind it.
- **The reference's public/personal segment is not drawn.** `DirectoryRow` carries no visibility or ownership field, and neither does the response the source reads; the filter segment in that position offers what the catalogue can answer instead.
- **The skills destination lists nothing, and cannot until a root-scoped catalogue exists.** `skill.list` is addressed by `sessionId`, so it cannot answer for a surface that opens without one, and no route reports personal, system or recommended skills. Closing this needs a session-independent skill-catalogue route plus the `connection`/`remote` injections this package deliberately does not take today.
