# @unieai/uad-ssh

English | [中文](README.zh.md)

The machines a person can already reach, and one shared connection to each.

## Why the `ssh` client, and not an SSH library

A developer who can type `ssh build-box` has already written down everything a connection needs: the jump host in front of it, which key it takes, a non-standard port, whether the agent is forwarded, how strictly host keys are checked. That file — `~/.ssh/config` — is the machine book, and Rabi keeps no second copy of it.

Reading it is not the same as agreeing with it. `Host` patterns, `Match` blocks, `Include` files and command-line options interact in an order OpenSSH defines and may extend; a parser that agreed today would diverge at the next release, and the divergence would appear as a machine that Rabi cannot reach but the terminal can. So this package asks the client instead: `ssh -G <alias>` prints the effective configuration, and running commands goes through the same binary that printed it.

That also settles authentication. Agent keys, hardware tokens, `ProxyJump`, `known_hosts` policy and every other credential path are OpenSSH's, unchanged, and Rabi never holds a secret it would have to store.

## What it offers

- **`list()`** — the aliases in the configuration file, following `Include`. Patterns (`Host *`, `Host !prod`, `Host *.internal`) are left out: they configure connections rather than name one. Unmemoized, so a machine added while Rabi runs is selectable immediately.
- **`resolve(alias)`** — what the alias actually means, from `ssh -G`.
- **`argvFor(alias, remoteCommand?, { tty })`** — the client invocation an adapter runs.
- **`probe(alias)`** — whether the machine answers, with the client's own message when it does not. `BatchMode` is what makes this answerable at all: a machine wanting a passphrase would otherwise wait for a prompt nobody is watching.
- **`disconnect(alias)`** — close the shared connection.

## Multiplexing

Every invocation asks for `ControlMaster=auto`, so the first command performs the handshake and the rest join it. Measured against a local server: 200 ms, then 7 ms. Without it every file read and every command would pay a full key exchange, and a remote workspace would feel like one.

The socket lives under the harness home. OpenSSH substitutes a 40-character digest for `%C` and then refuses **the whole connection** — not just multiplexing — when the bound path exceeds the platform's `sun_path` limit (104 bytes on macOS, 108 on Linux). A harness home deep enough to overflow it therefore costs multiplexing rather than the machine, and the check measures the expanded path, not the template.

## The remote command line

`ssh host <command>` hands the command to the person's **login shell**, whatever it is. Three details survived contact with real shells:

- `exec`, so no wrapper process stands between the connection and the command.
- Environment as an assignment prefix (`A=b exec cmd`), never `env A=b -- cmd`: POSIX `env` accepts `--` only before the assignments, and answers `'--': No such file or directory` otherwise.
- No `--` before the command either. `exec -- cmd` is a bash extension; dash answers `exec: --: not found`. What `--` would have guarded against is refused up front instead: a command name beginning with `-` is rejected rather than sent.

A missing working directory fails the command (`exit 127`) rather than running it in the login directory, because a caller that named a directory meant it.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it answers which machines exist and composes connection arguments for the adapters that do.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **The remote login shell must be POSIX-like.** The command line uses `cd`, assignment prefixes and `exec`, which sh, bash, dash, ksh and zsh all read the same way. A login shell of csh or fish would need its own composition, and none is written.
- **No passphrase prompt.** `probe()` runs in `BatchMode`, so a locked key reports as unreachable with OpenSSH's message rather than asking for the passphrase. Unlocking is the agent's job, outside Rabi.
- **Enumeration is shallow.** `list()` reads `Host` lines; a machine reachable only through a `Match` block, or one named solely by hostname on the command line, is connectable but not listed.
- **`Include` globs are not expanded.** A literal path in an `Include` is followed; a pattern is skipped, so aliases in `~/.ssh/config.d/*.conf` do not appear in the list even though `ssh` finds them.
