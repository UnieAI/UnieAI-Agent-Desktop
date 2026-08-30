# @unieai/uad-client-ui-settings-connectors

English | [中文](README.zh.md)

The Connections settings page: the outside services this app has been let into, what each connection covers, and the two buttons that grant or withdraw one. It is the surface over the [connector seam](../../connector/connector/README.md) — this package holds no token, stores no grant, and decides nothing about a protocol.

The section registers into the settings shell's `settings.section` slot at order 7, after Notifications and before Models.

## One row is the whole interaction

Every connector answers the same two questions — is it connected, and who to — so the page is a list of rows rather than a grid of cards with detail pages behind them. A row carries a mark, the service's name, one sentence of state, and the single control that acts on it. Someone looking for Google finds it by the logo without reading four labels, which is the only reason the mark column exists.

The sentence is chosen so that nothing on the page is technically true and practically useless:

- **Not connected**, or **Connected · someone@example.com** when the provider named the account that approved it.
- **Good until 30 Sep 2026, then asks again** for a connection the provider issued no refresh token for. That connection really does end, and a row that said only *Connected* would be lying to whoever comes back to it next week. The day, not the hour: nobody plans around 14:37.
- **Needs an application registered with this service first**, with the Connect button unavailable and a folded-away explanation beside it. See below.

## The approval happens somewhere this page cannot see

Connecting opens the provider's own sign-in page in the person's browser, and the host is what opens it — the flow listens on a loopback redirect that only the computer running Rabi can reach, so a page that tried to open the window itself would be pointing the wrong browser at it. While the approval is open the section shows a waiting notice naming the service and one Cancel button, because the next thing to do is in another window and saying so is the whole job.

Two rules follow from that:

- **One approval at a time.** Two open windows would race for the same loopback listener, and the second would fail for a reason nobody could act on. Every other Connect button is held while one is open.
- **Cancel aborts the attempt, and the attempt is what clears the notice.** Freeing the slot at the click would let a second approval start while the first is still unwinding.

A host with no desktop to open a browser on refuses before anyone waits: the flow would otherwise sit on a redirect that can never arrive.

## Why some connectors cannot be connected here

A provider that publishes a registration endpoint (RFC 7591) hands this app a client id at connect time, so it works on a fresh install with nothing configured. A provider that does not — Google and Microsoft both — needs an application registered with that vendor first, and the id that names it on the consent screen belongs to whoever runs this build. It cannot be shipped here.

Such a connector is still listed. Hiding it would look like a connector that does not exist, and the person would go looking for it. Instead the row says what is missing and the button is plainly unavailable, with the registration instructions folded behind a summary so someone who does not need them never reads them. `connectors.clientIds` in the composition is where the id goes.

## The marks

Google and Microsoft are drawn as their vendors publish them — flat shapes, official colours — because those vendors ask that their mark appear on the control that connects an account, and because a person recognises the logo faster than the word.

Every other connector gets a monogram tile in its own colour. An approximate redrawing of a logo from memory is worse than no logo: it is recognisably wrong, and it misuses the mark. A tile is a decision rather than a failure, and it stays correct when a connector this fork has never heard of is registered by a plugin.

## Model Experience

None, as the package renders a settings surface; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Disconnecting is local.** It deletes the grant this computer holds. The approval still stands with the provider until the person withdraws it there, and the copy says so rather than claiming an access revocation this program cannot perform.
- **The list is read when the page opens, not watched.** A grant changes only when someone presses a button here or withdraws access at the provider, and the host pushes neither; a second window that connected something is not reflected until this page is reopened.
- **Nothing here says what a connection is used for.** The page shows which services are connected, not which tools reach them — that belongs to whatever registers tools against a connector, and no such registration ships yet.
- **The waiting notice cannot tell an abandoned approval from a slow one.** A person who closes the provider's tab leaves the attempt open until they press Cancel; the flow has no signal for a window that went away.
- **Scopes are stored but not shown.** What a provider actually granted is on the wire and in the grant, and a row that listed six OAuth scope URLs would be unreadable to the audience this page is written for. A per-connector detail view is the place for them, and there is none.
