# @unieai/uad-execution-router

English | [中文](README.zh.md)

The execution world, routed to the machine a person is working on.

## What it does

Mounted in place of a single provider pair, `RoutedFileSystem` and `RoutedSubprocessRuntime` register `ctx.fs` and `ctx.subprocess` and forward every call to the providers for one machine — this computer, or one reached over SSH. Nothing above the seams changes: the Bash tool, the file tools, search, language servers and terminals keep consuming two interfaces, and which machine they land on becomes a choice a person makes rather than a composition decision made at boot.

Both must be mounted together and must name the same machine, because they are one execution world. A filesystem on one machine with commands on another would break the seam's central promise in a way no consumer could detect.

## How a call finds its machine

Two questions hide behind that, and they have different answers:

- **A call that names a TARGET already carries its machine.** A remote provider stamps its machine onto the target key, so reading a file resolved earlier goes back to the machine it came from. That is what keeps a target usable across a switch: a file handed out before the person changed machines does not silently become a different file with the same path.
- **A call that names a PATH, or nothing at all, is ambient.** Spawning a command, resolving a relative path, or asking for a terminal belongs to whichever machine is current, because there is nothing in the arguments to say otherwise.

Containment across machines is `false` rather than an error: asking whether a directory here holds a file there is a fair question with a plain answer.

## Worlds

One world per machine, built when that machine is first used and kept afterwards — switching back finds the connection still open, and a machine never used costs nothing.

Each world is a real provider constructed in an **isolated child context** (`ctx.isolate('fs')`), whose service slot is separate from its parent's. That is what lets this package register itself as the one `ctx.fs` while owning several others privately.

The two seams are built differently, and each way costs something the other cannot pay.

A **filesystem** world is mounted through the plugin lifecycle (`world.plugin(...)`), because its providers declare injections — the sandboxed local one needs `sandboxPolicy`, the remote one needs the machine book — and **only the plugin lifecycle honours a declared injection**. A provider built with `new` sits on a context with no inject list, so its own reads are refused by the context proxy (`cannot get property "sandboxPolicy" without inject`) and the seam answers nothing while looking mounted. Every filesystem method that matters is async already, so waiting for the mount costs nothing a caller can observe.

A **subprocess** world is constructed directly, because `spawn` publishes a live handle synchronously — a caller may write to the child's stdin on the very next line, and a handle whose streams appeared later would break callers the seam's own contract permits. That is affordable only because neither runtime needs an injection to work: the local one declares none, and the remote one is handed the machine book as a constructor argument rather than reading an undeclared service. Each directly-constructed provider's own schema is applied here, since schema defaults are the plugin lifecycle's work and construction skips them — a provider handed a bare `{}` would reject its own configuration.

## Model Experience

Indirectly, through every tool built on the two seams — the Bash executor, the file tools, search — which own their model-facing contracts; this package registers no tool, prompt, or schema of its own and only changes which machine their work happens on.

#### KV Cache effect

None. No prompt fragment, tool definition, or context entry originates here.

## Known Limitations and Deferred Work

- **Ambient calls follow the current machine, including in-flight sessions.** A conversation that started on one machine sends its next command to whichever machine is current, because a spawn carries no machine to read. Per-session or per-workspace routing needs a record that says which machine a session belongs to.
- **A switch does not move anything.** Files opened, terminals running and language servers started on the previous machine stay there; nothing is migrated, and nothing is closed.
- **Worlds are never torn down.** A machine used once keeps its provider — and, for a remote one, its multiplexed connection until OpenSSH's own idle window expires — until the router is disposed.
