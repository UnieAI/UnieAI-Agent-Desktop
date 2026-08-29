# @unieai/uad-client-ui-machines

English | [中文](README.zh.md)

The machine a conversation's work happens on, shown and chosen where the work is started.

## Where it sits

The **end** of the composer's tool row, in the icon cluster next to send, because where work runs is a standing fact about the composer rather than something to read on the way into a turn.

It takes a **resident** seat (`conversation.input.chrome.end`) rather than the session-scoped one. That seat exists for this: a person choosing a machine has not necessarily started a conversation yet, and on a remote machine which folders they can even pick depends on the answer. Its twin at the other end of the row (`conversation.input.chrome`) is the same seat in every respect but which end it renders at.

A remote machine looks different from this computer without opening anything: the trigger is a bare laptop icon on this computer and grows the machine's name the moment work is leaving it. Work leaving someone's own computer is not a detail to discover in a menu, and an icon alone cannot say which machine.

The menu is the same card as every other dropdown in that row — the model picker's material and metrics — so it belongs to the same set in either theme. It opens downward from the hero composer and upward once the composer is docked at the floor, keyed on the shell's phase rather than on measured space: the transcript column grows to whatever the composer needs, so a downward menu always "fits" and then covers the control that opened it. Long machine lists scroll inside it while *Add a machine* and the hints below stay in place.

## What it announces

A change of machine is a fact about the whole client, not about this control: it is announced as `machines/changed` (declared by the client runtime, so neither this package nor its listeners depend on the other) and only when the machine actually moved. A refused switch and a re-pick of the machine already in use both leave the execution world where it was.

The [gauges strip](../ui-machine-gauges/README.md) is the listener that matters today. Its reading describes the machine it was taken on, so after a move that reading is not stale — it is about somewhere else.

## What it reads, and when

The list is fetched when the menu opens, not cached and not watched. Machines come from a file the person edits outside Rabi — a cached list is stale exactly when someone has just added the machine they are looking for.

A failed read keeps the machines already on screen. Someone who can still see the list can still pick another machine, which is often the way out of whatever failed.

## Adding, removing, and everything else

Both are **dialogs**, not rows that grow inside the menu. Both write to the person's own SSH configuration, which is a different kind of act from picking where the next command runs: a five-field form unfolding inside a list of machines pushes the machines it is about off the bottom, and a confirmation rendered as one more row is dismissed by the same outside click that dismisses the menu. Opening either closes the menu.

**Adding** appends a block to the person's configuration. Only the fields they filled in are written — an option written with its default looks like a decision, and the next reader cannot tell it from one — and nothing already in the file changes.

The dialog is written for someone who has never heard of SSH. It opens with a picture — this computer, a connection, the machine being added — because the fields below assume a person already knows what adding a machine *means*. Three fields are visible (name, address, account, each with a label above and a plain sentence below rather than a placeholder that vanishes on the first keystroke); port, key file, and the configuration preview sit behind one disclosure whose summary names what is inside, so the person who wants them still finds them.

**The preview is the rule made visible.** It renders exactly the lines the write would append, updating as the fields change, and a field left empty produces no line at all. `previewLines` is the exported function that decides it, and it is the same rule the writer follows.

**Removing** takes that machine's whole block, and refuses when it cannot do so cleanly: an alias sharing a `Host` line with other machines, or one declared in an included file, is refused *with which it was*, because either edit changes a line another machine depends on. It asks before it writes, since the file is the person's.

**Test** asks whether a machine answers right now, in batch mode, so a machine wanting a passphrase reports OpenSSH's own message rather than waiting on a prompt nobody is watching.

Everything else is **Open SSH config**, which hands the file to the person's own editor. Editing an existing machine from a form is deliberately absent: an SSH configuration has syntax, comments, ordering and options this product has never heard of, and a form that parsed it into fields and wrote it back would lose them on the first save with nothing to say so.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it shows a person where their work runs and lets them change it, and the model is never told which machine it is on.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **Switching applies to everything at once.** The current machine is one value for the whole app, so a conversation already open sends its next command to the newly chosen machine. Per-conversation machines need a record the harness does not have yet.
- **The folder picker still browses this computer.** Choosing a remote machine changes where commands and files go, but the workspace browse dialog reads the host's own filesystem, so it shows local folders. A remote workspace can be created from a path, not yet chosen from that dialog.
- **A machine is listed because it is configured, not because it answers.** Nothing is probed when the menu opens; a machine that is off looks exactly like one that is on until someone presses Test or a command runs.
- **An existing machine cannot be edited here.** Adding and removing are whole-block operations, which is what makes them safe; changing one field means opening the file.
- **The form offers five fields.** Name, host, user, port and key file cover a machine reachable directly; anything else — a jump host beyond the one field, agent forwarding, per-host options — is written in the file.
