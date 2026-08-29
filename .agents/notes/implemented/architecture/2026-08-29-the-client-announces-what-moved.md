# Agent Note: the client announces what moved, because a surface cannot tell silence from stillness

Status: implemented

English | [中文](2026-08-29-the-client-announces-what-moved.zh.md)

## Problem

Two controls in the shell did nothing visible when pressed, for the same underlying reason, and both were reported as broken buttons.

**New chat.** `workspaces.startSession()` reuses a workspace's existing blank session rather than minting hidden duplicates — a rule that is right and stays. So the ordinary case resolves to the session already current, `sessions.open(id)` selects what is already selected, and nothing on screen moves. A person who had typed into the composer and pressed New chat kept their draft and their view: to them the button is dead. Nothing was logged, because nothing failed.

**The gauges strip after a machine switch.** The strip polls every four seconds and keeps its last reading when a poll fails, which is right — a missed sample is still best described by the sample before it. It has no way to distinguish that from the reading being about a *different machine*. So for up to four seconds after a switch, one machine's figures stand under another machine's name, and if the two machines are similar the strip looks like it never changed.

The shared shape: a surface holding per-session or per-machine state cannot tell "nothing happened" from "something happened that nobody told me about".

## Decision

**Both facts are announced on the client's own event bus, and the client runtime declares both.**

`workspaces/new-session(sessionId | undefined)` fires for **every** outcome of New Session, including the one where nothing moved, and including the cleared selection when there is no workspace to connect. `ui-conversation` listens and clears that session's draft — but only through `InputHub.existing(id)`, a non-creating lookup, so a freshly minted session (no composer yet) and another session's draft are both left alone.

`machines/changed(machine)` fires only when the machine actually moved: the picker compares the current machine before and after the host answers, so a refused switch and a re-pick of the machine in use announce nothing. `ui-machine-gauges` listens and calls `resample()`, which abandons the poll in flight, **drops** the reading rather than keeping it, and reads again immediately — and does nothing at all when no one is watching the strip, because the next mount reads fresh anyway.

**Both events are declared by `@unieai/uad-client-runtime`, not by the packages that emit them.** What moved is the execution world and the session selection: facts about the client, not about any one control. Declaring `machines/changed` in `ui-machines` would make every surface that describes a machine depend on the picker, which is backwards — the gauges package's whole design is that it knows nothing about machines and samples through the host.

**Clearing an unsent draft is the requested action, not data loss.** The person pressed New chat. The alternative — treating a draft as making a session non-blank, and minting a fresh session — loses the draft anyway and adds a hidden session per keystroke-then-reconsider.

## Alternatives considered

**Have `startSession` clear the draft itself.** The runtime would have to know what a composer draft is, and drafts live in `ui-conversation` behind a per-session input machine. The event keeps the layering and costs one line on each side.

**Announce only when something changed.** Right for the machine, wrong for New Session: the case worth reporting there is precisely the one where nothing moved. The two events differ on this deliberately.

**Let the gauges poll faster.** Four seconds is already a command run on someone's machine; a shorter interval spends more of them to shorten a window that only exists at a switch. The event costs one extra read at the moment it is warranted.

**Let the gauges keep the old reading until the new one lands.** That is the failed-poll rule, and applying it here would state that the new machine looks exactly like the old one. An absent reading is what the strip already draws before its first sample.

**Have `ui-machine-gauges` depend on `ui-machines` for the event type.** One fewer declaration site, and it inverts the dependency: a surface that describes a machine would import the control that changes it.

## Consequences

Two client-wide facts now have a named place to be observed, and the next surface that needs them — a file tree that should re-read on a machine switch, a panel that should reset on New Session — subscribes instead of polling or reaching across packages. The cost is that both events must keep firing: an emit deleted from either call site is a button that goes quiet again, which is why both are covered by a test that goes red when the emit is removed.

`InputHub.existing()` is new public surface on a package-internal registry. It exists so a reaction to something that happened *to* a session cannot materialize that session's input machine as a side effect of looking.

## Verification

Against a running `rabi web` with a real workspace connected: typing into the composer and pressing New chat leaves the textarea empty, with no console error — the state that previously kept the draft and changed nothing.

Unit coverage pins both rules and the mutation of each turns it red: the workspaces service announces the session it settled on (including the already-current one) and announces `undefined` when the selection is cleared; the picker announces a real move and stays silent on a re-pick of the machine in use; and the gauges view drops its reading and re-reads on `resample()`, while doing nothing when no reader is mounted.

The gauges' end-to-end leg is **not** covered: the strip lives in `conversation.session.header.gauges`, which the header hides while a session is blank, so a browser probe cannot observe the resample without a session carrying real turns.
