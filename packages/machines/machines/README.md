# @unieai/uad-machines

English | [中文](README.zh.md)

Where work happens: this computer, or a machine the person can reach.

## What it is

One service with two answers a surface needs — which machines exist, and which one is current — and it remembers the second across restarts. It holds no connection and runs no command; the [routed execution world](../execution-router/README.md) does that, and asks this service which target to use.

The list is not a list this package keeps. It is `local` plus the aliases in the person's own OpenSSH configuration, read through `ctx.ssh` on every call. A second machine book would be a second place to keep correct, and the first one is already written.

This computer is always first and always present. A deployment with no OpenSSH configuration still has somewhere to work, and a person who has lost access to every remote machine can still get back.

## Choosing one

`select(id)` refuses a machine nothing offers, and says what there is. Storing an unknown target would leave a Rabi that fails every command until the person found the setting again and worked out what it meant.

The current target is read from settings on every call rather than cached: someone changing machines is exactly the moment a stale answer is wrong.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it answers which machines exist and which one is current, and the model is never told either.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **One machine at a time.** The current target is a single durable value, so every session in the process works on the same machine. A workspace remembering its own machine — so two conversations can work on two machines at once — needs a record field this service does not have yet.
- **A machine is offered because it is configured, not because it answers.** Reachability is not probed when listing; `ctx.ssh.probe()` exists, and a surface that wants a live indicator calls it per machine.
