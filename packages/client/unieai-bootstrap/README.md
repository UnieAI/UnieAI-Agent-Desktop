# @unieai/uad-client-unieai-bootstrap

English | [中文](README.zh.md)

Startup initialization for the UnieAI desktop. It makes one request — `GET /auth/bootstrap` — before the application mounts, and publishes the answer as the `unieaiBootstrap` service: whether this desktop is signed in, and what the host has already gathered on that account's behalf.

It exists because the question *"is this desktop signed in, and what does it have"* used to be answered separately by every surface that needed it. The account section read `/auth/account`, the API Provider section read `/auth/providers`, the plugins page read `/auth/mcp`, and each invented its own empty state while its own request was in flight. The interface opened onto sections that were each in a different state, and a signed-out desktop discovered that fact several times over.

## The shape: the host gathers, the browser reads once

The gathering happens on the host, in `@unieai/uad-unieai-web-gate`, not here. Two facts decide that:

- **The host already holds the session and the desktop API key.** Every one of these reads is a product call authenticated by a credential that must never reach a page, so a browser asking for four things means the host making four or more product calls anyway — with a same-origin round trip in front of each.
- **The host can start before the browser exists.** The gather begins the moment a device grant lands, which is while the browser is still navigating from the sign-in page to the application. By the time this package asks, the answer is usually already in memory.

So the browser makes one request and gets one body. Each part of it is *verbatim what that part's own route would have answered* — `parts.account` is an `/auth/account` body, `parts.providers` is an `/auth/providers` body, and so on. This package narrows none of them: every consumer already owns the reader for its own route, and a second copy of those four wire formats here could only drift from the first.

## What happens when the network is bad

The desktop's first frame waits on this read, so the read must end. Three numbers bound it, and every one of them ends in the application opening:

| Bound | Value | What it does |
|---|---|---|
| Host gathering deadline | 2s | The host answers with the parts that landed and names those still being gathered. |
| Browser read timeout | 3s | Past this the read is abandoned and the snapshot is `unavailable`. |
| Follow-up delay | 1.5s | A `partial` answer is asked for once more, in the background, after this long. |

`unavailable` is not a failure the user is shown. It is every surface's instruction to read its own route, which is exactly what each of them did before this package existed — so a desktop whose product is unreachable opens on the same screens it always did, with the local agent working, and nothing waiting on the cloud.

The signed-out path costs one local round trip and no waiting at all: the host answers a browser with no session without calling the product, because there is nothing to gather and nothing to refuse.

## Where it sits in boot, and why blocking there is safe

`packages/client/web/src/boot.ts` activates every client entry and only then mounts React. This plugin's `apply` is `async`, so its fiber stays loading until the startup read settles, and the loader quiescence the mount waits on includes it. That is the feature: the interface opens onto an account it already knows about.

Two details make that safe rather than fragile:

- **The wait is bounded by this package, not by the network.** Worst case is the browser read timeout, after which the snapshot is `unavailable` and everything proceeds.
- **`apply` must not be an ordinary `function` declaration.** Cordis calls a plugin body that has a prototype with `new` and discards its return value; only a body with no prototype — an `async function`, or an arrow — is called plainly and has its promise awaited. Written the other way this plugin would activate immediately, the mount would race the read, and every test would still be green.

## Consumers inject it

A consumer of the startup answer names `unieaiBootstrap` in its `inject`. This is not a stylistic choice about optional services: while this package is reading, its fiber is not active, and Cordis does not hand out a service whose fiber is not active. A surface that looked for it with `ctx.get` would find nothing at its own apply time, fall back to reading its own route, and leave the gathered answer unused. Injecting also means the snapshot a consumer's body reads is the settled one.

The consequence is that a composition keeping a consumer row while dropping this one leaves that consumer's fiber pending — which the boot page reports by name, rather than failing silently.

`@unieai/uad-client-unieai-account-gateway` is the first consumer and the model for the rest: it takes its first account from `parts.account`, and every refresh it performs afterwards — a profile save, an invite, a retry — still reads `/auth/account` directly. The startup answer describes the start of the document; it is not a cache of the product.

## Model Experience

None, as the package reads one startup answer for browser surfaces; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Only the account part has a consumer today** — the answer carries `providers`, `models` and `mcp` as well, gathered and cached by the host, but `ui-unieai-providers` and `ui-plugins-page` still read their own routes on first render. Those packages are owned elsewhere; routing them through this service is a change in them, not here, and until it happens their first read costs what it always did.
- **The follow-up read happens once** — a `partial` answer earns exactly one more attempt. A part that is still not there afterwards is left to its own surface's retry gesture, because a warm start that kept asking would be a poll, and nothing here knows how long the product intends to take.
- **The snapshot is not re-read when the session lapses** — the gate's sessions expire on idleness, evaluated when a request is made, so a desktop that has been open for longer than the idle timeout holds a startup answer describing a session that no longer exists. Every surface discovers that on its own next request, which answers `signed-out`; this package publishes nothing new until something asks it to refresh.
- **There is no visible loading state of its own** — the boot page's existing spinner covers the wait, and nothing is added to it. A read that takes the full three seconds looks exactly like a boot that is loading plugins, because that is also what it is doing.
- **`refresh()` exists for completeness** — the boot path calls it once and nothing else calls it. A consumer that wants the current state reads its own route, which is what says what is true now.
