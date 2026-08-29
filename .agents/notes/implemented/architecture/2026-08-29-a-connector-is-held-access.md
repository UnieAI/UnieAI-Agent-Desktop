# Agent Note: a connector is held access, and the seam owns no protocol

Status: implemented

English | [中文](2026-08-29-a-connector-is-held-access.zh.md)

## Problem

Reaching a person's Google Drive or Microsoft account needs three things that already exist here separately — a conversation with the human (`ctx.authorization`), somewhere durable to keep what it produced (`ctx.credentials`), and something to spend it — and one that did not: a name for "an external service this harness has access to", so a surface can list them, connect one, and see which are connected.

The obvious shape was wrong twice over. A seam that also decided *how* to ask someone for approval would have to be rewritten for every surface that asks differently. And a seam that opened a browser would be wrong everywhere that is not one.

There was also a question with a price attached: whose OAuth application is it? A desktop program cannot keep a client secret, and most providers will not accept a loopback redirect from an application nobody registered.

## Decision

**The seam owns three things: which connectors exist, whether one is connected, and a token valid right now.** Nothing else. The human conversation stays with `authorization`; the durable grant is a `credentials` `GrantRecord`; what a connector is *for* belongs to whatever registers tools against it.

**Connecting emits `connectors/authorize` with the URL rather than opening it.** Which surface shows a URL — a browser, a notice in a chat, a line in a terminal — is the shell's answer.

**The grant lives in `credentials`, not in a store of this package's own.** `modifyRecord` is a serialized read-modify-write that holds across processes, and its own documentation names this case: two processes rotating one refresh token concurrently would otherwise lose whichever wrote first, leaving a person disconnected with nothing to explain it. The refresh runs inside that lock. A private store would have to earn that property again.

**Loopback and PKCE, always.** A desktop harness has no server, and the out-of-band "paste this code" flow is withdrawn at Google and deprecated elsewhere; RFC 8252's loopback listener is what is left. The port is the OS's choice, so a provider has to accept any loopback port. PKCE is not optional because there is no secret to fall back on, and a server that will not accept `S256` is refused rather than downgraded.

**Two kinds of provider, and the difference is who has to register an application.** A provider named by ISSUER publishes its own endpoints (RFC 8414) — the server is the authority on its own addresses, and a copied URL goes stale silently. Every one shipped that way also advertises a registration endpoint, so the app registers itself at connect time (RFC 7591), declaring the loopback redirect it is already listening on. **Those work on a fresh install with no client id from anybody.** A provider written out as URLs needs an application registered with the vendor; it is listed anyway and refuses to connect until a client id is configured, naming what is missing, because hiding it would look like the connector does not exist.

**Scopes are a property of the provider entry, because they have a price.** Google sorts scopes into non-sensitive, sensitive and restricted, and a restricted scope commits the publisher to a third-party security assessment repeated every twelve months. What ships asks for none of them: `drive.file` sees only files the person picks or this program created. Widening that list belongs to whoever owns the OAuth application.

## Alternatives considered

**Put the OAuth flow in `authorization` itself.** That seam owns the conversation and deliberately not the protocol — its own documentation says a second protocol arrives as another flow, not another seam. A connector needs more than a credential anyway: status, scopes, and a token that refreshes.

**Adopt Nango's provider registry.** It is the reference implementation for this problem and its `providers.yaml` covers 982 services. It is Elastic License 2.0 — source-available, not open source — so shipping the file would put non-OSI material into the product with notice obligations, for entries we do not need. Reading each provider's own RFC 8414 document is both licence-clean and more correct: the server is the authority, and a copied list goes stale.

**Ship a client id for the self-registering providers too.** Pointless: they issue one on demand, and a pre-registered id is a thing to keep in sync for no gain.

**Require a client id, refusing to list a provider without one.** A connector that vanishes from the list looks like a connector that does not exist. Listing it and refusing by name is what tells someone what to do.

## Consequences

A fresh install can connect Notion, Linear and Sanity with nothing registered anywhere, because those providers issue clients on demand. Google and Microsoft wait for an application registered by whoever ships this build — and say so instead of failing at the provider.

The seam hands out a token and nothing else: base URLs, pagination and retry policy per service are not modelled, so each consumer writes its own calls. That is deliberate for now; an API proxy is a second design and this one should not guess at it.

Only `authorization_code` exists. Client-credentials, device-code and API-key connectors are all common and none of them are here; each is another `kind` on the descriptor and another branch in the flow.

## Verification

Twenty-four tests, of which the ones that would rot silently are mutation-checked: removing the `S256` refusal, or dropping either of the two authorization parameters Google needs for a refresh token, each turns one red.

The three self-registering providers were confirmed against their own live discovery documents — `mcp.notion.com`, `mcp.linear.app` and `mcp.sanity.io` each publish `authorization`, `token` and `registration` endpoints and advertise `S256` — rather than copied from a third-party list.
