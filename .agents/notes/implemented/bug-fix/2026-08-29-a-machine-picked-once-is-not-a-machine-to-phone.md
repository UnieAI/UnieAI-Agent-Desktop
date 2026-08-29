# Agent Note: a machine picked once is not a machine to phone on every launch

Status: implemented

English | [中文](2026-08-29-a-machine-picked-once-is-not-a-machine-to-phone.zh.md)

## Problem

Someone who had once picked a remote machine could not start a conversation at all. The window opened and then nothing happened, and on a copy launched from a shell, `ssh` was asking for a password in a terminal they were not working in.

Three separate facts composed into that:

**The choice of machine is remembered.** It is settings, so it survives a restart — which is right, and means a launch begins pointed at a machine that may be asleep, moved, or behind a key that is not in the agent yet.

**Startup asked that machine about every remembered session.** `WorkspaceRuntime.indexHeader` canonicalizes each session header's `cwd` through `ctx.fs`, and `ctx.fs` is routed. Measured on a profile with eleven sessions: **eleven ssh connections before the UI had loaded**, with nobody having asked for anything.

**Nothing stopped the client from prompting.** `BatchMode=yes` was set for `probe()` alone, so every other invocation was free to ask for a password — and piping the child's stdin does not prevent this, because OpenSSH opens `/dev/tty`. The harness then waits for a keystroke that, for a windowed app, nobody can supply.

Together: a remembered choice turned every launch into eleven blocking password prompts on a terminal nobody was looking at.

## Decision

**Indexing never reaches a machine nobody asked for.** With a remote execution world, `indexHeader` records the header's `cwd` as written and does not canonicalize it. The check reads the current machine through cordis' non-throwing optional lookup, so a composition that mounts no machine book — which therefore has no other machine to be on — is unaffected and needs no new declared dependency.

This is not only about when to connect. It is also the wrong question to ask: a header's `cwd` was recorded on the machine that session ran on, and the machine selected now is not necessarily that one. `/srv/app` names different directories on two computers, so canonicalizing a remembered path against whatever machine happens to be current produces an answer about the wrong computer. Recording the path as written is the honest answer until a header carries its own machine.

**Nothing may ask for a password on a terminal nobody is watching.** `argvFor` puts `BatchMode=yes` on every invocation except a terminal session. The refusal becomes OpenSSH's own — `Permission denied (publickey)` — which a surface can show and a person can act on by adding their key to their agent. A real terminal session (`-tt`) keeps prompting, because the person is looking at that one and a passphrase prompt there is the connection working.

The rule lives in `argvFor` because every path that connects builds its argv there: two in `fs-ssh`, three in `subprocess-ssh`. One choke point, one rule.

## Alternatives considered

**Connect lazily but still at index time.** Deferring the same eleven connections to the first render moves the stall rather than removing it, and the answer would still be about the wrong machine.

**Drop the remembered machine at startup.** It removes the connections by throwing away the person's choice, which is a worse product: they picked that machine deliberately.

**Prompt through the app instead of the terminal.** The right end state for a machine that genuinely needs a passphrase, and much larger: it needs a UI, a way to hand the secret to a child process without a tty, and a policy for storing it. Batch mode is what makes the failure visible today; that is the prerequisite, not a substitute.

**Record the machine on the session header.** The real answer to the second half, and it changes a durable format. Left as follow-up: with it, a remembered path could be canonicalized against the machine it belongs to instead of not at all.

## Consequences

A launch performs no remote work, whatever machine is remembered, and a machine that cannot authenticate non-interactively fails in the open instead of stalling behind a prompt.

The cost is that a remote session's recorded `cwd` is no longer canonical: symlinks and `..` are left as written, so two headers naming the same directory by different spellings are no longer merged into one workspace while a remote machine is selected. That is visible only as duplicate grouping, and it is strictly better than an answer computed on the wrong computer.

## Verification

Measured against the running harness with a machine that resolves nowhere and eleven remembered sessions: **eleven ssh invocations at startup before the change, zero after**, counted by putting a recording `ssh` on the harness's PATH.

The prompt rule is pinned by two tests — a command carries `BatchMode=yes`, a terminal session does not — and removing either half turns one red.
