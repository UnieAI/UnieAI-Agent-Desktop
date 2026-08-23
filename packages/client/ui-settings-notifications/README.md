# @deepseek-ai/dsh-client-ui-settings-notifications

English | [中文](README.zh.md)

The Notifications settings page, and the behavior it describes: when a turn finishes in this app while nobody is watching it, this device plays a cue and — once the browser has been given permission — raises a desktop notification that opens the session it came from. The page is the UnieAI Copilot web product's notification settings reproduced for a local host, with one block deliberately narrower than the original — see *What "push" means here* below.

The section registers into the settings shell's `settings.section` slot at order 5, between General and Models. Everything it shows is a fact about the current device; nothing on this page reaches the host.

## What counts as a finished task

There is no server-side job queue in this deployment. A turn runs in the local host, and the client already knows when it ends: the sessions list carries a `running` bit per session, which is what the sidebar's activity dot reads. A completion is therefore the running→idle edge of one list row, derived in the browser from a snapshot the runtime already publishes. This package opens no subscription of its own and adds no wire traffic.

Two rules keep the edge honest:

- **A run shorter than `MIN_RUN_MS` (2s) is not a task.** Opening a session marks it running until the host's first status frame settles it back, and a reconnect replays the same flicker. Real turns run far longer.
- **The first snapshot arms nothing.** Sessions already idle when the page loaded never finished while anyone could have been told, and one already running has no observed start.

A completion is *attended* when the window is visible **and** that session is the one on screen — the finish announced itself, so the page stays quiet. Everything else is announced. A session that disappears from the list did not finish and is forgotten rather than reported.

## What "push" means here

The web product's equivalent block is titled *Push notifications* and promises delivery "while the app is in the background **or closed**". That is Web Push: a service worker, a VAPID-signed sender, and a server holding per-device subscriptions. This repository has none of the three, and none of them would help — the thing that would have to notify you *is* the process you closed.

What the desktop app does have is the browser's own `Notification` API. The host serves the page over `127.0.0.1`, which is a secure context, so the API is available and a notification raised while the window is in the background reaches the OS notification centre. That is what the Enable button asks for, and it is what the block's copy says, minus the "or closed" clause. `desktop.title` and `desktop.desc` are the only two strings that depart from the web product's catalog, and they depart in the direction of what this build can actually do.

The permission prompt is reachable **only** from the Enable button's click. A prompt raised without a user gesture is refused, and Chrome counts the refusal against the origin permanently. Once the browser has answered, the block renders a sentence instead of a control: nothing on this page can undo a granted or a blocked permission, and a switch that cannot switch anything is worse than a statement of fact. A permission revoked in the browser's site settings never notifies the page, so the state is re-read whenever the window comes back on screen.

## The cue, and where the clips live

The eleven cues and the `unieai:notify-sound` storage key are the web product's, so a user who chose one there recognises the same names here. The choice is per-device on purpose — which cue suits a machine depends on its speakers and where it sits — so it lives in `localStorage` rather than in a synced setting. Clicking a cue both selects and plays it; the picker has no separate preview control.

The clips are served by the web shell from `apps/web/public/sounds/notify/<id>.wav`, and [`dsh-host-frontend-static`](../../host/frontend-static/README.md) types them as `audio/wav`. This package only names them: it holds no bytes, and a build that ships the page without the clips still works, silently.

The eleven names are the web product's; the audio is not. Each clip is synthesised from scratch for this repository — added sine partials, frequency glides, and, for `rattle`, filtered pseudo-random noise, every one shaped by a few-millisecond attack and an exponential decay so it neither clicks nor startles. Nothing is recorded or sampled, so the set is original work under this repository's MIT licence and owes no entry in `THIRD_PARTY_NOTICES.md`. They are mono 16-bit 44.1 kHz WAV, 0.34 s to 1.00 s long, peaking at or below -6 dBFS.

The cue plays for every unattended completion, whether or not notifications were granted — it is the half of this page that needs nothing from the browser. Playback is best-effort: the autoplay policy rejects until the page has been interacted with, and a rejected or missing clip is swallowed rather than surfaced.

## Model Experience

None, as the package renders a settings surface and reacts to a client-side list edge; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No Web Push, and no path to it from here** — a notification arrives only while the page is open, backgrounded or not. Restoring the web product's "or closed" promise needs a service worker, a VAPID key pair, a host-side subscription store, and a sender; none exist in this repository, and the sender would have to outlive the process the user closed.
- **The cues are synthesised tones, not designed audio** — the eleven clips are generated waveforms rather than the work of a sound designer, and they sound plainer than a commercial set. They were verified by measurement — duration, peak level, loudness, absence of clipping, and pairwise spectral distinctness — not by listening on a range of speakers, so how well they carry from a laptop across a room is untested. They also ship uncompressed, about 660 kB for the set, because this repository's toolchain has no audio encoder; a compressed set would need one added.
- **Nothing announces a completion in the TUI** — this is a browser package. A turn finishing under `dsh` on a terminal reaches no notification and plays no cue.
- **The cue cannot be turned off** — the picker mirrors the web product's, which offers eleven cues and no silence. A user who wants completions announced visually but not audibly has to mute the tab.
- **Announcements are not rate-limited** — a batch of sessions finishing together raises one notification each. The per-session `tag` coalesces repeats of the *same* session only.
- **A completion the page missed is never announced** — the running bit is read from the live list, so a turn that started and finished while the app was closed is only visible as a session that is already idle at load, which arms nothing by design.
