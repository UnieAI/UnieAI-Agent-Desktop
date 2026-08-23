# @deepseek-ai/dsh-client-ui-plugins-page

English | [中文](README.zh.md)

The **Plugins** page: the standalone surface the sidebar's Plugins row opens, holding the UnieAI account's **Studio MCP** servers, this build's read-only **plugin directory**, and this deployment's **cordis plugin registry** as three areas on one page.

## Why it exists

The word "plugin" meant two different things in this product, and the sidebar row promised the wrong one. In the UnieAI Copilot web product, Plugins is a destination: bundles and MCP servers an account installs. In this desktop, Plugins was the cordis registry behind a settings section — real, useful, and developer-facing. Pressing the sidebar row opened the second while the label promised the first.

Both are areas here now, and neither owns the word alone. Nothing was rewritten to achieve that: the cordis surface is still `ui-settings-plugins`' own component, its own tabs, and its own cards; it moved from the `settings.section` seat to this page's `plugins.page.area` seat, which is the same shape of seat on a different surface.

The settings shell's own Plugins nav row disappeared without being touched. It renders only while a `plugins` settings section is registered, and after the move none is — so the two rows can never appear together and [`ui-settings-general`](../ui-settings-general/README.md) needed no edit.

## What it is, structurally

One `shell.overlay` entry, which is the seat the shell documents for a surface of one's own. The page paints the base background across the frame and carries its own way back — the header control, and Escape from anywhere on it. Being frame-wide, it covers the sidebar while open; a page that sat beside the column would need a page seat the layout owner does not declare today.

It declares one hole, `plugins.page.area`: a root-scoped list whose owner supplies nothing, so an area draws its own heading, its own intro, and its own body. Adding an area to the page is a registration, not an edit here. This package registers the plugin directory at order -10 under the entry id `unieai-directory` and Studio MCP at order 0; [`ui-settings-plugin-inventory`](../ui-settings-plugin-inventory/README.md) registers the cordis inventory at order 5 under the id `plugin-directory`; `ui-settings-plugins` registers the cordis registry at order 10. The two ids are confusingly close and must stay distinct: a list slot holding two entries with one id refuses to load rather than shadowing one with the other, which takes the whole app down at boot.

The page owns ONE reading measure, centred at 720px, and every area inherits it. It is set here rather than in an area because an area that centred itself while its neighbour ran full width would put two column edges on one page. The frame itself stays full width — the page is a destination, not a dialog — and the way back sits in the frame's own top-left corner, outside the measure, because it belongs to the window rather than to the text.

## Tabs, not a stack of areas

Each occupant is a place of its own — what the account can install, what it has connected, and what this build loads — and stacking them made the page a scroll in which the directory's 22 rows and the Loader's 128 sat end to end with nothing saying they were different kinds of thing.

The loaded-modules tab is **off by default** (`showLoadedModules`, a `Config` field a deployment sets in its own patch layer). Nothing on it can be acted on: the host's inventory service is read-only and cannot enable, disable, add or remove anything. A reader who opens Plugins is looking for what they can install, and a list of engine parts they cannot touch — sitting beside that directory under a similar word — reads as a broken control rather than as a report. It is also why the tab says "Loaded modules" and not "Deployment plugins": the word "plugins" already means the installable kind on this page.

The tab table lives in the page and names entry ids from other packages, which is the one place this page knows its occupants. That coupling is deliberate and gated: `plugins.page.area` carries no per-entry label, so a generic strip would have nothing to write on itself, and a test asserts the table covers every id actually registered — an area added without a tab fails there rather than disappearing from the page.

## The directory: the product's catalogue, as something to choose from

A directory answers "what could I add", which is a different question from the cordis inventory's "what is loaded", and the two want opposite layouts. The inventory is read by whoever maintains the deployment and wants density and identifiers; the directory is read by someone deciding, and wants a name, a sentence in their own language, and one control. So its rows are two to a line inside the page's measure, each carrying a mark, a name, a one-line description and a single `+` / `✓`.

Rows come from `/auth/plugins` and nothing is shipped in this build: a plugin the product adds appears on the next read, with no desktop release. Grouping is the product's too — `category` arrives on each row from the plugin's own manifest, and a heading is drawn for each value present. There is deliberately no "Featured" run: an editorial group with nothing behind it would be this package asserting a judgement the catalogue never made. A row whose manifest names no category collects under one trailing heading, and that word is a dictionary key rather than a value from the wire, because "the manifest named none" and "the product filed it under other" must stay distinguishable.

The publisher pills are derived from the rows, so a publisher the product adds tomorrow gets a pill without a release. Only two stand on the row before the rest fold behind More — the filters and the search field share one line, and a catalogue with a publisher per plugin would otherwise push the field a reader reaches for onto a line of its own. The chosen pill always stands, even past the cut: a filter that cannot be seen cannot be turned off.

A write does not flip its own row. The product decides what installed means — which version was bound, whether a policy downgraded the request — so an install re-reads the catalogue and the row moves on the answer. `canInstall` is reported beside the rows rather than on them, because it is a property of the reader: a free account sees the whole catalogue and may install none of it.

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

Every line whose text the web product already publishes is copied verbatim from its `messages/{en,zh-tw,zh-cn,ja}.json`, with the source namespace and key named beside it in [`src/client/locales.ts`](src/client/locales.ts). All four shipped locales carry a complete dictionary; this package's own words are only the states the web page cannot be in — no session, a deployment older than the MCP route, a list still loading — and the two lines naming an unnamed server and an unreported origin. There is deliberately no key for a tool that reported no description.

## Styling

CSS Modules and semantic `--dsw-alias-*` tokens only, with no literal colour, no fallback value, and no brand hue. The nav row draws the shell's own row geometry, because `sidebar.nav.action` holds no state for its occupants. Server origins and tool names are set in the code face, because both are values people compare character by character or retype.

The tool grid is `repeat(auto-fill, minmax(min(232px, 100%), 1fr))`. The `min(…, 100%)` floor is load-bearing, not decoration: the page runs the full frame width, and a bare `232px` floor overflows its container the moment the frame is narrower than one track, which would scroll the whole page sideways at 390px.

A tool card is filled rather than outlined, on `--dsw-alias-bg-module-platform`, and takes `--dsw-radius-control` rather than `--dsw-radius-card` — at tile size the card radius reads as a blob. `--dsw-alias-bg-layer-1` is unusable for a card on this page: the light palette resolves it to the same value as `--dsw-alias-bg-base`, which the page paints, so a fill-only card using it would exist in dark and vanish in light. A test asserts both choices against the stylesheet.

## Model Experience

None, as the package contributes browser presentation only; neither area reaches a model request.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **Listing is not connecting, and this desktop still cannot connect.** The answer carries the server's origin and no endpoint or credential, by explicit design; the stored headers and OAuth bearer are decrypted server-side and never projected to a client. Connecting therefore needs either a product-hosted relay the desktop can dial with its own key — which is what [`@deepseek-ai/dsh-mcp-client`](../../mcp/mcp-client/README.md) already supports, as a `streamable-http` server with an `authorization` header — or a decision to send MCP credentials to a laptop, which contradicts how this desktop handles every other credential. Both are outside this package.
- **Nothing in this repository mounts a listed server.** `mcp-client` mounts one server per static config row with a compile-time-unique name; turning a live list into live connections needs a supervisor that mounts and disposes plugins as the list moves, and no such component exists here. Until one does, this area is a window onto the account's Studio and not a source of tools for a turn.
- **A deployment older than the route still shows `unsupported`, and still logs one 404 per page open.** The state and its copy are kept for exactly that deployment. The console line is the visible cost of asking a route that may not be there, and asking is what makes the area light up with no further change in the browser.
- **Tool cards carry no description, because two host hops drop it.** The product writes one per Studio tool in `lib/studio/mcp-tools.ts`, and it is discarded twice on the way here: `lib/desktop/mcp.ts` publishes `tools: STUDIO_MCP_TOOLS.map((tool) => tool.name)`, and `web-gate`'s `McpServerView.tools` is typed `string[]` and copied through `readTools`. Filling the cards needs both changed to carry `{name, description}` — the product route and the gate's grant/view pair — and neither file is this package's. The browser half is already done and tested: a described entry renders, a bare name still reads, and nothing here fabricates a sentence in the meantime.
- **The area cannot tell a disabled server from an enabled one.** The browser-facing contract reports no enabled flag and no ownership scope, so the row shows neither rather than guessing; a reader who needs that distinction reads it on Studio.
- **No product serves `/auth/plugins` yet, so the directory reads `unsupported` in every current deployment.** The browser half is complete and tested against the catalogue's own rows; what is missing is `/api/desktop/plugins` on the web product, which today answers 404 while `/api/desktop/mcp` and the rest answer 401. The response fields the source reads are fixed and documented in `directory-source.ts`, so shipping that route is the only remaining step.
- **The directory shows plugin names exactly as the catalogue stores them.** Most are slug-style (`gl-reconciler`, `kyc-screener`) and only `text-transform: capitalize` separates them from their identifiers, which renders `Gl-Reconciler`. Rewriting them in the browser would be this package inventing product names; the fix belongs in the catalogue.
- **No publisher in the catalogue has uploaded a mark, so every row draws initials.** `iconUrl` is read and rendered when present — the column exists on the product side and is stored `NOT NULL DEFAULT ''` — and the initials tile is neutral for every row on purpose: a colour per plugin would be this package inventing brand identity for someone else's product.
- **The page covers the sidebar while open.** `shell.overlay` spans the frame, and the layout owner declares no seat for a surface that sits beside the navigation column. The page's own Back control and Escape are the way out; a sidebar-adjacent page needs a new seat in [`ui-layout`](../ui-layout/README.md).
