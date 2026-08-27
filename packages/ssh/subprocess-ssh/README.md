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

## Terminals

A terminal is a local PTY running `ssh -tt`, which carries the bytes, the window size and the session's lifetime. A terminal is also what makes `-tt` correct here: the newline translation and merged streams that would corrupt a collected command are exactly what a terminal wants.

Every question *about* the session is answered on the machine instead, because the local PTY's foreground process is always `ssh`:

- **What is in the foreground** comes from the remote terminal's own `tpgid`, so it follows every `fg`, pipeline and nested program without the harness tracking any of it. The session's wrapper records its terminal (`tty`) before becoming the shell, which is how a second connection knows what to ask about.
- **A signal goes to the remote foreground group.** Signalling the local PTY would reach the `ssh` client and end the whole session where the person meant to interrupt one command.
- **Ending the session signals every member of the remote SESSION**, not just the shell's process group. Job control is the point of a terminal: `sleep 90 &` runs in its own group, and a group-scoped kill would leave it running with nothing left to observe it.
- **Whether the shell is waiting for input** is read from the kernel wait site (`wchan`) of the foreground group. The stronger proof the local provider uses — the blocked syscall and its file descriptor — is unavailable: `/proc/<pid>/syscall` needs ptrace-level access, and a machine running the default `kernel.yama.ptrace_scope=1` refuses it to a second SSH session. Where the wait site is unnamed or unrecognized this reports nothing rather than guessing.

## What it refuses

**A relative executable path**, exactly as the local provider does: the base it would resolve against is undefined, and crossing a network does not supply one.

## Model Experience

Indirectly, through the tools built on `ctx.subprocess` — the Bash executor above all — which own every model-facing contract; this package registers no tool, prompt, or schema of its own and only changes which machine their work happens on.

#### KV Cache effect

None. No prompt fragment, tool definition, or context entry originates here.

## Known Limitations and Deferred Work

- **Input-waiting is evidence, not proof.** The kernel wait sites this recognizes (`n_tty_read`, `read_chan`, `wait_woken`, `ttyin`) cover current Linux and BSD; a kernel that spells it otherwise reports nothing, and a consumer's readiness logic falls back to silence. `wait_woken` in particular is a general wait site, so a foreground group blocked on something else can read as waiting.
- **Foreground inspection costs a round trip**, and readiness polling asks repeatedly. Multiplexing keeps each one cheap, but a machine on a slow link answers a poll slower than a local `/proc` read.
- **The remote must have a POSIX-like login shell**, which the [machine book](../ssh/README.md) documents.
- **One machine per mount.** The alias is configuration, so every session in the process runs on the same machine; choosing per workspace needs a router the harness does not have yet.
- **`exitCode` 255 is ambiguous.** It is OpenSSH's own failure code and also what a terminated run reports, so a caller cannot distinguish "the connection failed" from "the remote command was killed" by status alone.
