# Agent Note: Desktop task-completion notifications

Status: implemented

English | [中文](2026-08-22-desktop-task-completion-notifications.zh.md)

## Problem

The UnieAI Copilot web product ends a background task by telling you: a push notification and a chosen sound. The desktop app ended one silently. Reproducing the web product's settings page here runs into a mismatch: its notification block is Web Push — a service worker, a VAPID-signed sender, and a server-side subscription store — and it promises delivery "while the app is in the background **or closed**". This repository has none of that infrastructure, and the process that would have to send the push is the one the user closed.

The question was therefore not "port the page" but "what can a local host actually do, and what does the page honestly say about it".

## Decision

`packages/client/ui-settings-notifications` registers a `settings.section` at order 5 (between General and Models) with two blocks, and owns the behavior both blocks describe.

**Completion is derived, not pushed.** The sessions list already carries a `running` bit per session — the sidebar's activity dot reads it — so `SessionCompletionWatcher` subscribes to `ctx.sessions.list` and treats a row's running→idle edge as a finished turn. No host subscription, no new wire traffic. Two guards keep the edge honest: a run shorter than `MIN_RUN_MS` (2s) is the open-a-session flicker rather than a task, and the first snapshot arms nothing, because a session already idle at load finished when nobody could have been told. A completion is *attended* when the window is visible and that session is the one on screen; attended completions are dropped, since the finish already announced itself.

**The first block is the browser's `Notification` API, not Web Push.** The host serves the page over `127.0.0.1`, a secure context, so a notification raised while the window is backgrounded reaches the OS notification centre. The permission prompt is reachable only from the Enable button's click: a prompt without a user gesture is refused, and Chrome counts the refusal against the origin permanently. Once the browser has answered, the block renders a sentence rather than a control — nothing on the page can undo a granted or blocked permission, and a switch that switches nothing is worse than a statement of fact. Visibility changes re-read the permission, because a revocation in site settings never reaches the page.

**The second block is the web product's cue picker, reproduced whole.** The eleven cue names and the `unieai:notify-sound` storage key are the web product's, so a choice made there is recognisable here; the preference is per-device in `localStorage` rather than synced, because which cue suits a machine depends on that machine. Clicking a cue selects and previews it. The clips live at `apps/web/public/sounds/notify/<id>.wav`, and `dsh-host-frontend-static` gained an `audio/wav` MIME entry so a media element will decode them.

The cue plays for every unattended completion whether or not notifications were granted — it is the half of the page that needs nothing from the browser.

**The names are the web product's; the audio is this repository's.** The first cut of this feature copied `copilot-v2`'s clips, which that repository records as cut from the iOS-17 sound set — Apple's audio, in an MIT repository, unrecorded in `THIRD_PARTY_NOTICES.md`. They were replaced with eleven synthesised cues: added sine partials, frequency glides, and filtered pseudo-random noise for `rattle`, each shaped by a few-millisecond attack and an exponential decay, written as mono 16-bit 44.1 kHz WAV. Nothing is recorded or sampled, so the set is original work under this repository's own licence and needs no third-party notice. The ids and labels did not change, so a stored preference still resolves.

**Copy comes from the web product's catalogs in all four shipped locales**, with exactly two departures, both in the direction of what this build can do: the block is titled *Desktop notifications* rather than *Push notifications*, and its description drops the "or closed" clause.

## Alternatives considered

**Ship the Web Push block anyway, wired to nothing.** It would match the reference pixel for pixel and lie: the toggle would ask for a permission that no sender would ever use. The brief's own rule — do not ship a toggle that does nothing — decides this.

**Build Web Push for real.** A service worker, a VAPID key pair, a host-side subscription table, and a sender. The sender is the problem: for the "or closed" promise it must outlive the local host process, which means a server this deployment does not have. Deferred as a limitation rather than attempted.

**Consume the session manager's existing `completed` bit** instead of deriving edges. The manager arms that reminder only for *non-selected* sessions, so a turn finishing in the session you have open behind a hidden window would never announce. Deriving the edge locally also keeps the flicker threshold in the package that cares about it.

**Embed the clips as base64 data URIs** in the client bundle, avoiding both the `apps/web/public` write and the MIME entry. The set is about 660 kB of uncompressed WAV, which becomes roughly 880 kB of base64 in a bundle every client loads at boot, to save one line in a MIME table.

**Play the cue only when notification permission is granted.** It would tie the two blocks together, but the web product's picker offers no such gate, and the cue is precisely the part that works without asking the browser for anything.

## Testing

Seven suites under `packages/client/ui-settings-notifications/tests` (51 assertions): catalog and storage round-trip including hostile and absent cells; the permission port across every access value, a rejecting `requestPermission`, and a constructor that demands a service worker; the watcher's edge, threshold, attendance, removal, and restart semantics; the controller's single-prompt rule, cue persistence, and announcement gating; the section's render for each permission state; and a composition suite on a real `SlotRegistry` and `LocaleRuntime` that drives a fake sessions list end to end — a finished turn produces a cue plus a tagged notification, an attended one produces neither, and fiber disposal empties the slot and drops the list subscription. `dsh-host-frontend-static` gained an `audio/wav` assertion in its existing real-composition suite. The generated clips were checked by decoding each file: duration, peak level, RMS loudness, silent first and last samples, and pairwise spectral correlation across the set.

## Consequences

The desktop app now tells you when work finished, using nothing but what the client already knew. The cost is that the page's reach stops at the open document: closing the app ends notifications, and a turn that started and finished while the app was closed is invisible by design, since it appears only as a session that is already idle at load.

The clips are this repository's own synthesised audio, redistributable under the same MIT licence as the code and needing no entry in `THIRD_PARTY_NOTICES.md`. What they are not is designed audio: they are generated tones, verified by measurement rather than by listening on a range of speakers, and they ship uncompressed because the toolchain has no audio encoder.
