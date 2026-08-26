# Agent Note: Remote machines over the person's own `ssh` client

Status: implemented

English | [中文](2026-08-26-remote-machines-over-the-ssh-client.zh.md)

## Problem

Rabi runs where it is installed. A person whose work lives on a build machine, a GPU box, or a company server can point the harness at a local checkout only, while the machine that has the toolchain, the data, and the GPUs sits behind `ssh` and is reachable from every terminal on the computer except this one.

The [portable execution-world decision](2026-07-28-portable-execution-world-consumers.md) already established that `ctx.fs` and `ctx.subprocess` together define an execution world, and that Bash, persistent terminals, language servers and the file tools consume those two interfaces rather than naming a provider. The E2B realization proved it against a remote Linux sandbox. What it did not answer is how to reach a machine that already exists and that the person already has credentials for — one whose access rules are written in `~/.ssh/config` and enforced by an SSH agent, a hardware token, a bastion host, or a company CA.

Reaching such a machine with an SSH protocol library means re-implementing what that file means. `Host` patterns, `Match` blocks, `Include` files, `ProxyJump`, `IdentityAgent`, `known_hosts` policy and per-host overrides interact in an order OpenSSH defines and continues to extend. An implementation that agreed with the file today would diverge at the next release, and the divergence would surface as a machine the terminal can reach but Rabi cannot — with no way for the person to tell which of the two is wrong.

## Decision

The substrate is the `ssh` client already on the computer. `packages/ssh/ssh` (`ctx.ssh`) owns three facts and nothing else:

- **Which machines exist.** Read from the person's own OpenSSH configuration, following `Include`. Patterns (`Host *`, `Host !prod`, `Host *.internal`) are excluded: they configure connections rather than name one. Unmemoized, so a machine added while Rabi runs is selectable immediately.
- **What an alias means.** `ssh -G <alias>` prints the effective configuration for a connection not yet made, with every pattern, block and default already applied. Reading that output is the only way to agree with the client that will connect.
- **One connection per machine.** Every invocation carries `ControlMaster=auto`, so the first command performs the key exchange and the rest join it. Against a local server: 200 ms, then 7 ms. Without multiplexing every file read would pay a handshake and a remote workspace would feel like one.

Authentication is therefore never Rabi's. Agent keys, hardware tokens, jump hosts and host-key policy stay with OpenSSH, and no secret is stored, prompted for, or forwarded by this repository.

Nothing is installed on the remote machine. A remote development server would be a second artifact to version, deploy and keep compatible with the client; the two seams above need only a shell and a filesystem, which `sshd` already provides.

### The remote command line

`ssh host <command>` hands one string to the person's **login shell**, whatever that is. Three details survived contact with real shells, and each is pinned by a test that names the shell that taught it:

- **`exec`**, so no wrapper process stands between the connection and the command. A signal delivered to the connection would otherwise reach the wrapper and leave the command running.
- **An assignment prefix for environment** (`A=b exec cmd`), never `env A=b -- cmd`. POSIX `env` accepts `--` only before the assignments; a standard `env` answers `'--': No such file or directory` and the command never runs.
- **No `--` before the command.** `exec -- cmd` is a bash extension; dash answers `exec: --: not found`. What `--` would have guarded against is refused at composition instead: a command name beginning with `-` is rejected rather than sent.

A missing working directory fails the command with `exit 127` rather than running it in the login directory, because a caller that named a directory meant it.

### The control socket

The multiplexing socket lives under the harness home. OpenSSH substitutes a 40-character digest for `%C` and then refuses **the whole connection** — not merely multiplexing — when the bound path exceeds the platform's `sun_path` limit (104 bytes on macOS, 108 on Linux). The guard therefore measures the expanded path, not the template, and a harness home deep enough to overflow it costs multiplexing rather than the machine.

## Alternatives considered

**An SSH protocol library (`ssh2`).** Rejected because the machine book is `~/.ssh/config` and only OpenSSH defines what it means. A library would own an ever-growing surface — pattern matching, `Match` evaluation, `ProxyJump` chains, agent and token protocols, `known_hosts` policy — whose only correctness criterion is agreeing with a program already installed on the machine. It would also make Rabi a credential holder, and a desktop application that stores SSH secrets acquires a threat model it cannot discharge.

**Parsing `~/.ssh/config` to resolve connections.** Rejected for the same reason at a smaller scale: enumeration is a hint a person confirms by picking, but resolution decides where a command runs. `ssh -G` is the client's own answer and cannot disagree with the client.

**A Rabi-owned machine list.** Rejected because it is a second place to keep correct. A developer who can type `ssh build-box` has already recorded the port, the key, the jump host and the agent policy; asking them to restate it, and to restate it again when it changes, is how the two lists start disagreeing.

**Installing a helper on the remote machine.** Rejected as a deployment model, not a feature. The seams need a shell and a filesystem; a resident server adds versioning, upgrade, and compatibility obligations to every machine a person connects to, in exchange for capabilities this decision does not need.

**One process-wide remote world, like the E2B POC.** Not rejected but not sufficient: it is what this package supports today. Selecting a machine per workspace requires routing a call to a target chosen from the calling session, which `ctx.agents.currentInitiator()` makes possible and which no code here does yet — stated under Deferred rather than implied by the composition.

## Testing

Four hermetic suites pin the substrate rules: alias enumeration including `Include` and its cycles, `ssh -G` reading, the remote command line's three shell lessons, and the connection options with the control-path measurement.

`subprocess-ssh` adds its own: hermetic tests for the pid-file lines and the refusals, a live suite for commands, lookups and remote termination of a HUP-ignoring tree, and a composition suite that runs `dsh-bash-local` — which knows nothing about SSH — over the remote seam and asserts on the executor's own result.

A gated suite (`tests/live-connection.e2e.ts`) runs the same code against a real `sshd`: resolution, reachability and its failure message, connection reuse (asserted as the master's existence, because a duration comparison fails exactly when the machine is busy), exit-status propagation, stream separation, environment carrying an embedded quote, working directories present and missing, and multi-byte output. It reports itself skipped without `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS` rather than passing hollowly, and the file documents the disposable server it expects.

## Deferred

- **The filesystem adapter.** `fs-ssh` is what puts file reads, writes, edits and searches on the machine; `subprocess-ssh` ships with this note and puts every command there.
- **A terminal on the machine.** `subprocess-ssh.spawnTerminal` refuses rather than allocating a local one, because the local PTY's foreground process is always `ssh` and prompt and idle detection would read it as the shell. Remote foreground inspection is the missing piece.
- **Choosing a machine per workspace.** The service pools by alias so that several machines can be live at once, but nothing yet routes a call to one. `ctx.agents.currentInitiator()` is the ambient fact a router would read.
- **A login shell that is not POSIX-like.** csh and fish would each need their own composition of the remote command line.

## Consequences

Rabi reaches every machine the person can already reach, with the access rules they already wrote, and holds no credential to do it. The cost is a dependency on an `ssh` client being installed and on the remote login shell being POSIX-like, and the acceptance that OpenSSH's behavior — including its failure messages — is what a person will see when a machine does not answer.
