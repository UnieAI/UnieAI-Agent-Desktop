# @unieai/uad-connector

English | [中文](README.zh.md)

The external services this harness has been given access to, and the token to reach one with.

## What it owns, and what it deliberately does not

Three things: which connectors exist, whether one is connected, and a token that is valid *right now*.

It owns no protocol. The conversation with the person belongs to [`authorization`](../../credentials/authorization/README.md); the durable grant belongs to [`credentials`](../../credentials/credentials/README.md) as a `GrantRecord`; and what a connector is *for* belongs to whatever registers tools against it. A seam that also decided how to ask someone for approval would have to be rewritten for every surface that asks differently.

**It does not open a browser.** Connecting emits `connectors/authorize` with the URL. Which surface shows it — a browser, a notice in a chat, a line printed in a terminal — is the shell's answer, and a seam that opened a browser itself would be wrong everywhere that is not one.

## Why the grant lives in `credentials`

`modifyRecord` is a serialized read-modify-write that holds **across processes**, and its own documentation names this case: two processes rotating one refresh token concurrently would otherwise lose whichever wrote first, leaving a person disconnected with nothing to explain it. The refresh runs inside that lock, and a second caller that also found the token expired sees what the first wrote instead of spending the refresh token again.

A store of this package's own would have to earn that property a second time.

## The grant this program can actually run

A desktop harness has no server, so it cannot receive a redirect on a public address, and the out-of-band "paste this code" flow that used to stand in for one is withdrawn at Google and deprecated elsewhere. What is left is [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252): bind a **loopback** listener on an ephemeral port and register `http://127.0.0.1` as the redirect. The port is the OS's choice, so a provider has to accept any loopback port rather than one fixed number.

**PKCE, always.** A native app cannot keep a client secret — it ships inside the binary — so the exchange is bound to a verifier this process generated instead. Every connector here is a public client; no secret is stored, read, or sent. A server that will not accept `S256` is refused rather than downgraded, because there is nothing to downgrade *to*.

The listener answers exactly one request and refuses the rest, and compares `state` without leaking the difference through timing: anything else that can reach loopback must not be able to end an attempt in progress.

## Two kinds of connector, and the difference is who has to register an application

**Named by issuer.** The provider publishes its own metadata ([RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414)), so the endpoints are read rather than written down — the server is the authority on its own addresses, and a copied URL goes stale silently. Every one shipped this way also advertises a registration endpoint, so the app registers *itself* at connect time ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)), declaring the loopback redirect it is already listening on. **These work on a fresh install, with no client id from anybody.** Notion, Linear and Sanity ship this way.

**Written out as URLs.** These need an application registered with the vendor first. They are listed anyway and refuse to connect until a client id is configured, naming what is missing — hiding them would look like the connector does not exist. Google and Microsoft ship this way, both as public clients with a loopback redirect, so neither needs a client *secret*.

A client id issued by on-demand registration is stored **with the grant**: it belongs to that registration, and a refresh presenting a different one is refused.

## Scopes are a product decision with a price

Google sorts scopes into non-sensitive, sensitive and restricted, and a restricted scope commits the publisher to a third-party security assessment that must be repeated every twelve months. The scopes shipped here are deliberately the ones that do not: `drive.file` sees only files the person picks or this program created, and the identity scopes name the account so two connections can be told apart.

Widening that list is a decision with a cost, and it belongs to whoever owns the OAuth application — which is why the scopes are a property of the provider entry rather than of an install.

## Model Experience

None, as this package registers no tool, prompt, schema, or context. It holds access; whatever spends that access registers its own tools and is the thing the model sees.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **One grant per connector.** A person with two Google accounts can connect one of them. Two would need the record key to carry an account as well as a provider, and every caller to say which it means.
- **Disconnecting is local.** The record is removed here; the approval still stands with the provider until the person withdraws it there. Saying otherwise would be a claim this program cannot keep.
- **The identity token is a label, not proof.** `id_token` is read for an email to show and is not verified: it arrived over TLS from the token endpoint this flow just called, and the access it accompanies is proved by that endpoint. A caller needing an authenticated identity must verify it itself.
- **No API proxy.** The seam hands out a token; base URLs, pagination and retry policy per service are not modelled, so each consumer writes its own calls.
- **`authorization_code` only.** Client-credentials, device-code and API-key connectors are all common and none of them are here; each is another `kind` on the descriptor and another branch in the flow.
