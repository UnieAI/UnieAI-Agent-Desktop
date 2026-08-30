# Agent Note: the host opens the browser, and a connector that cannot be connected says so

Status: implemented

English | [中文](2026-08-30-the-host-opens-the-browser.zh.md)

## Problem

The connector seam could store a grant and hand out a token, and nothing could reach it. `ctx.connectors` was composed nowhere, no RPC exposed it, and `connect()` emitted `connectors/authorize` into a context with no listener — so an approval URL was produced and dropped, and the flow then waited on a redirect nobody had been shown.

Two decisions were open, and both are about honesty rather than plumbing.

**Who opens the browser.** The seam deliberately emits the URL rather than opening it, because a seam that opened a browser would be wrong on every shell that is not one. Something still has to open it.

**What a person sees for a connector this build cannot connect.** Google and Microsoft publish no registration endpoint, so they need an application registered with the vendor and a client id that names it on the consent screen. That id belongs to whoever runs the build; it cannot ship here. Before this change the only way to learn that was to press Connect and read the failure.

## Decision

**The host opens the browser, because the redirect only it can reach.** `host.connectConnector` subscribes to `connectors/authorize` for the duration of one attempt, filters to the connector it is connecting, and hands the URL to `openNativeUrl`. The seam stays shell-agnostic; the API gateway — the local GUI carrier that already owns `openPath` and the `canOpenPath` capability — is what knows this deployment has a desktop.

The client was the other candidate and is wrong here: the approval settles a promise the host is holding, the frame carrying the URL would arrive long after the click that could have authorised a popup, and in the browser that matters the loopback listener is on the host's machine, not the viewer's.

Three rules keep the attempt from lying about its state:

- **A host with no desktop refuses before anyone waits.** `canOpenPaths()` false is answered immediately with `connector-refused`, rather than by a redirect that can never arrive.
- **A browser that will not open ends the attempt.** The route runs the seam on its own `AbortController`, chained to the caller's. An `openNativeUrl` rejection aborts it, and the reported message is the opener's own — not the abort it caused.
- **`openNativeUrl` is not `openNativePath` with a URL.** The path opener translates WSL paths for the Windows desktop, which mangles an address, and reaches Windows through `Invoke-Item`, which opens files rather than addresses. The URL opener uses `open`, `Start-Process`, and `$BROWSER`/`xdg-open`, and accepts nothing but `http` and `https`: the address comes from a provider's own metadata, and every one of those commands hands its argument to a registered handler, where a `file:` URL would open a local document.

**A connector states whether it can be connected at all, before anyone presses anything.** `ConnectorStatus.requiresClientId` is true when the provider's endpoints are written down, it publishes no registration endpoint, and `connectors.clientIds` names no id for it — decided without touching the network, because listing connectors must not depend on reaching every one of them. A provider named by issuer answers false: whether its server still offers registration is a network fact, and such a provider that turns out not to refuses at connect time with the same words.

The page then lists that connector, marks it, and disables its button with the registration instructions folded behind a summary. Hiding it would look like a connector that does not exist, and the person would go looking for it.

**The wire carries names and state, and never a token.** `ConnectorView` is built by a function that names every field it copies; the access token, the refresh token and the client id have no path to it.

### The section is a list, because every connector answers the same two questions

`@unieai/uad-client-ui-settings-connectors` registers into `settings.section` at order 7. One row per connector — mark, name, one sentence, one control — rather than cards with detail pages behind them: the questions are *is it connected* and *to whom*, and both fit on a line.

The sentence is chosen so nothing on the page is true and useless. A connection the provider issued no refresh token for reads *Good until 30 Sep 2026, then asks again*, because it really does end; the day and not the hour, because nobody plans around 14:37.

The list is read when the page opens rather than watched. A grant changes when someone presses a button here or withdraws access at the provider, and the host pushes neither.

One approval runs at a time, and the attempt — not the click — clears the slot. Two open windows would race the same loopback listener, and freeing the slot at the Cancel click would let a second approval start while the first was still unwinding.

Google and Microsoft are drawn as their vendors publish them; everything else gets a monogram tile in its own colour. An approximate redrawing of a logo from memory is recognisably wrong and misuses the mark, and a tile stays correct for a connector this fork has never heard of.

### Two scaffold facts the web suite was blocked on

Both predate this change and blocked every scenario in `apps/web/tests`, not only the new one.

The shipped Web surface serves every page behind the UnieAI sign-in gate, which redirects an unauthenticated browser to `/auth/login` before any client bundle loads. No scenario has an account, and none is about the fence, so the scaffold disables that row; the gate's coverage lives with its own package.

The first-run tour opens a modal over everything on a home the scaffold has just created, so every scenario's first click landed on its mask. The scaffold seeds `first-run.seen` for the same reason it seeds the welcome notice, and `firstRunTourPending` keeps it unseen for a scenario about the tour itself.

## Alternatives considered

**The client opens the approval page.** `window.open` in the renderer already reaches the system browser under Electron, and it needs no host opener. It loses on three counts: the URL would have to travel as a host frame and arrive after the user gesture that could have authorised a popup, the loopback listener is on the host's machine rather than the viewer's, and the promise the person is waiting on is the host's.

**Hide a connector with no client id.** Fewer rows, and no explaining. It reads as a connector that does not exist, which sends someone looking for a feature they already have.

**Let Connect fail and show the seam's refusal.** The refusal names exactly what is missing, so the information is not lost. It arrives after a click that could only fail, which is the interaction this section exists to remove.

**Compute `requiresClientId` by discovering every issuer.** It would be exact for a provider named by issuer. Listing connectors would then depend on reaching all of them, so a page would go blank because one server was slow.

**Reuse `openNativePath` for the URL.** No second function. It translates WSL paths and opens Windows targets with `Invoke-Item`, both of which are wrong for an address.

**Disable the sign-in gate in one scenario's overlay.** It was the first shape of the fix here. It leaves every other scenario in the directory red for a reason that has nothing to do with what it tests.

## Consequences

An approval works end to end: press Connect, the person's own browser opens at the provider, and the row updates when the grant is stored. A connector that needs an application registered says so where someone reads it instead of where they click.

The host now opens a browser, which is a capability the API gateway did not have. It is confined to one address per attempt, http(s) only, and only while `connectConnector` is running.

Lifting the sign-in gate in the scaffold means the web suite no longer exercises the gate at all. That was already true — every scenario timed out on the login page — and the gate is covered by its own package, but the composition under test now differs from the shipped one by that row.

## Testing

The seam: `requiresClientId` for the three provider shapes, and that a configured or blank client id moves it.

The RPC domain, on a composed host context: a deployment with no connectors lists nothing rather than breaking, the view carries no token, the approval page opens for the connector being connected and not for another emitted while it runs, a refusing opener ends the attempt with the opener's own message, a caller's abort reaches the seam, and a host with no desktop refuses before waiting. Removing the connector filter turns the third one red.

`openNativeUrl` per platform, including WSL taking the Windows desktop without path translation, and the refusal of everything but http(s).

The section and its store in jsdom at 100% per-file coverage: each state's sentence and control, the one-approval rule, cancel, and every route's refusal.

`apps/web/tests/connector-settings.e2e.ts` drives the shipped Web composition in a real browser: the five shipped connectors render, the three self-registering ones offer a working Connect, and Google and Microsoft are marked and disabled.

## Deferred

The rest of `apps/web/tests` fails for reasons that predate this work and are not the two scaffold facts above — `settings-chrome` alone fails eight scenarios at HEAD once the gate and the tour are out of the way. That drift is its own change.
