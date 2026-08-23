# Agent Note: Plugins as a page, and the MCP list the desktop cannot have

Status: implemented

English | [中文](2026-08-22-plugins-as-a-page.zh.md)

## Problem

"Plugin" named two different things in this product, and the sidebar row named the wrong one. In the UnieAI Copilot web product, Plugins is a destination: bundles and MCP servers an account installs. In this desktop, Plugins was the cordis registry — Shell, Agent loop, Web search — behind a `settings.section` described as "the plugins installed in this deployment". Pressing 外掛程式 opened deployment internals while the label promised the account's plugins.

The registry is a real feature and must not be deleted. It must simply stop being the only meaning of the word, and stop being what a product-level nav row opens on its own.

The second half of the request — show the account's MCP servers, the way UnieAI Studio holds them — turned out to be a question about what the desktop can honestly offer, not a rendering task.

## Decision

**Plugins is a page, not a settings section.** A new client package, `ui-plugins-page`, registers one `shell.overlay` entry — the seat the runtime documents for "a surface of your own that floats over the whole app" — and one `sidebar.nav.action` row that opens it. The page owns its chrome, its open state, and one hole: `plugins.page.area`, a root list whose owner supplies nothing, so an area draws its own heading and body.

**The cordis surface moved seats; it was not rewritten.** `ui-settings-plugins` registers the same `PluginsSettingsSection` component, with the same tabs, the same cards, and the same settings scope, into `plugins.page.area` instead of `settings.section`. The two owner shares are the same shape, so the component changed only in the slot name its props reference. Its heading is now "Deployment plugins", because a second "Plugins" heading under the page's own would say that the page is that registry.

**The old nav row retires itself.** `ui-settings-general`'s Plugins row renders only while a `plugins` settings section exists. Moving the section is exactly that condition, so the two rows can never appear together and the settings shell needed no edit — which matters, because that package was being changed elsewhere at the same time.

**Studio MCP lists; it does not connect, and it offers no control that implies it could.** Three independent things are missing, and none of them is in this repository: the product's MCP list route authenticates by browser session cookie only, so the desktop's API key cannot reach it; its server summary carries the ORIGIN and never the endpoint, by explicit design, because a remote MCP URL routinely carries a token in its path or query; and the stored headers and OAuth bearer are decrypted server-side and never projected to any client. A desktop given the listing would still have nothing to dial. An install button would fail on every press, so none is drawn.

**A 404 is `unsupported`, which is a state of its own.** The area reads `GET /auth/mcp` through the sign-in gate, the way the API Provider section reads `/auth/providers`. No host here serves that route. The 404 is reported as "this build has no MCP surface", distinct from a failed read and very distinct from an account with no servers; collapsing any pair of those would put "you have no MCP servers" on a page that never managed to ask. The request is still made — one 404 per page open — so the surface lights up when the route lands with no further browser change.

**The row type has no `url` and no `headers` member.** Not because today's host omits them, but so a future host cannot start sending a credential to a page without someone editing the type.

## Consequences

- A new client package registers in the four required places (`tsconfig.client.json`, `tsconfig.base.json` paths, the web-app bundle patch roster, the web-app manifest). Its roster row sits ahead of `ui-settings-plugins`, which now has nowhere to render without it.
- The page covers the sidebar while open, because `shell.overlay` spans the frame and the layout owner declares no seat beside the navigation column. Back and Escape are the way out. A sidebar-adjacent page needs a new seat in `ui-layout`.
- Copy is copied verbatim from the product's `messages/{en,zh-tw,zh-cn,ja}.json` where an equivalent string exists, with the source namespace and key named beside each line, in all four shipped locales.
- `webSearchDescription` said "The DeepSeek search provider" in a rebranded app. The vendor identity is real and stays; the line now names DeepSeek as the supplier of the search API rather than as this product.

## Alternatives considered

- **Keep the cordis surface registered as a `settings.section` and add a second Plugins row for the page.** Rejected: two rows with the same label, and the settings dialog would still answer the product-level question with deployment internals.
- **Render the page into the conversation column, the way `ui-trajectory` registers a view.** Rejected: `conversation.view` is session-scoped, and Plugins is not about a session — the page would be unreachable with no conversation open.
- **Measure the sidebar's width from the overlay's DOM ancestry so the page sits beside the column.** Rejected: it couples this package to another package's element order for a layout the layout owner should declare. Recorded as the limitation above instead.
- **Ship an install or connect control against the product's existing cookie-authenticated MCP routes.** Rejected: the desktop holds an API key, not a session cookie, and even a successful list carries no endpoint and no credential. Offering something that cannot work is worse than an honest empty state.
- **Project full URLs and headers to the desktop so it could connect directly.** Rejected on the same ground the API Provider section rejected pulling provider keys down: it moves server-held secrets onto a laptop holding a long-lived key. The eventual shape is a product-hosted relay the desktop dials with its own key — a `streamable-http` server with an `authorization` header, which `dsh-mcp-client` already supports unchanged.
