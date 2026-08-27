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

## Editing the configuration

**Open SSH config** hands the file to the person's own editor through the host, and the file it opens is the one that declared a machine — that is where they are actually keeping them. Rabi does not edit it: an SSH configuration is a file with its own syntax, its own comments and its own history, and a form that round-tripped it would lose all three.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it shows a person where their work runs and lets them change it, and the model is never told which machine it is on.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **Switching applies to everything at once.** The current machine is one value for the whole app, so a conversation already open sends its next command to the newly chosen machine. Per-conversation machines need a record the harness does not have yet.
- **The folder picker still browses this computer.** Choosing a remote machine changes where commands and files go, but the workspace browse dialog reads the host's own filesystem, so it shows local folders. A remote workspace can be created from a path, not yet chosen from that dialog.
- **A machine is listed because it is configured, not because it answers.** Nothing is probed when the menu opens; a machine that is off looks exactly like one that is on until a command runs.
