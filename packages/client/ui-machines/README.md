# @unieai/uad-client-ui-machines

English | [中文](README.zh.md)

The machine a conversation's work happens on, shown and chosen where the work is started.

## Where it sits

The composer's tool row, beside the workspace chip, because the machine belongs to the same question as the working directory: *where does what I am about to ask actually run.*

It takes the **resident** seat (`conversation.input.chrome`) rather than the session-scoped one. That seat exists for this: a person choosing a machine has not necessarily started a conversation yet, and on a remote machine which folders they can even pick depends on the answer.

A remote machine looks different from this computer without opening anything. Work leaving someone's own computer is not a detail to discover in a menu.

## What it reads, and when

The list is fetched when the menu opens, not cached and not watched. Machines come from a file the person edits outside Rabi — a cached list is stale exactly when someone has just added the machine they are looking for.

A failed read keeps the machines already on screen. Someone who can still see the list can still pick another machine, which is often the way out of whatever failed.

## Adding, removing, and everything else

**Adding** appends a block to the person's configuration. Only the fields they filled in are written — an option written with its default looks like a decision, and the next reader cannot tell it from one — and nothing already in the file changes.

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
