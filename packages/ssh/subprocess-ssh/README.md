# @unieai/uad-subprocess-ssh

English | [中文](README.zh.md)

The subprocess seam, placed on a machine reached over SSH. Mounted in place of [`subprocess-local`](../../subprocess/subprocess-local/README.md), it moves every command the harness runs — the Bash tool's executor, language servers, searches — onto that machine, without any of them knowing.

## A rewrite, not a reimplementation

This provider extends the local one and turns each spec into an `ssh` invocation of the same command. Everything below the rewrite is the local provider's, already written and tested: detached process trees, collect mode with its offset readers and spill files, the SIGTERM-grace-SIGKILL escalation, disposal, host-exit finalization. Here that machinery manages the `ssh` client process standing in for the remote command.

Two things the local spec means locally have to be re-pointed:

- **The working directory** is the remote machine's. The client itself runs in the harness user's home, because a spec's `cwd` names a path that usually does not exist on both machines.
- **The environment** belongs to the remote command, so it travels inside the command line rather than to the client. What the client needs — `HOME`, `PATH`, `SSH_AUTH_SOCK` for agent authentication — comes from the local provider's scrubbed parent environment.

## Remote process lifetime

**A remote command outlives the connection that started it.** Measured against a real server: killing the local client leaves the remote command running, with a terminal allocated and without one, and a command that ignores `SIGHUP` survives either way.

So the connection is not a handle on the process, and a pid file is. The remote shell records its own pid and then `exec`s — the pid stays the command's own — and terminating a run opens a second (multiplexed, so cheap) connection that signals that pid's **process group**. The group is what makes it a tree kill: under sshd the command shell is its own group leader, so one signal reaches the command and everything it started. Where there is no group to signal, the single pid is the fallback.

Termination does both halves and needs both: ending the client releases the caller's streams and settles the outcome, while the remote signal is what stops the work.

## What it refuses

- **A terminal.** `spawnTerminal` throws. The inherited implementation would allocate a **local** terminal and run the argv here, so a person would get a shell on their own computer while everything else ran on the machine — and the filesystem and subprocess providers would stop describing one execution world, which is the seam's central promise.
- **A relative executable path**, exactly as the local provider does: the base it would resolve against is undefined, and crossing a network does not supply one.

## Model Experience

Indirectly, through the tools built on `ctx.subprocess` — the Bash executor above all — which own every model-facing contract; this package registers no tool, prompt, or schema of its own and only changes which machine their work happens on.

#### KV Cache effect

None. No prompt fragment, tool definition, or context entry originates here.

## Known Limitations and Deferred Work

- **No terminal yet.** `spawnTerminal` refuses, so `terminal-bash` and the terminal a person drives cannot run on a remote machine. What is missing is remote foreground inspection: the local PTY's foreground process is always `ssh`, and prompt and idle detection would read it as the shell.
- **The remote must have a POSIX-like login shell**, which the [machine book](../ssh/README.md) documents.
- **One machine per mount.** The alias is configuration, so every session in the process runs on the same machine; choosing per workspace needs a router the harness does not have yet.
- **`exitCode` 255 is ambiguous.** It is OpenSSH's own failure code and also what a terminated run reports, so a caller cannot distinguish "the connection failed" from "the remote command was killed" by status alone.
