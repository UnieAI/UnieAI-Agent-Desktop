# ssh/ — remote machines over OpenSSH

English | [中文](README.zh.md)

One execution world placed on a machine the person can already reach, using the `ssh` client already on their computer. The [portable execution-world decision](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md) owns the composition: `ctx.fs` and `ctx.subprocess` together define a world, and every capability above them — Bash, persistent terminals, language servers, the file tools — consumes those two interfaces rather than naming a provider.

| Package | ctx key | Role |
|---|---|---|
| [`ssh`](ssh/README.md) (`@unieai/uad-ssh`) | `ctx.ssh` | The machines in the person's own OpenSSH configuration, what an alias resolves to, and one multiplexed connection per machine |

Nothing is installed on the remote machine. A remote development server would be a second thing to version, deploy and keep compatible; the two seams above need only a shell and a filesystem, which sshd already provides.

The boundary is the same one E2B draws: the remote owns the mutable filesystem, commands, terminals and language-server processes, while the harness keeps Cordis and plugin objects, the agent loop, session state and persistence, model calls, prompts, tools and authority. Nothing here moves the harness itself.
