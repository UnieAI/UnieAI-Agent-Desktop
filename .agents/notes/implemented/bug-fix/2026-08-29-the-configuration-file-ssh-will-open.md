# Agent Note: the machine book reads the file ssh will open, not the one HOME names

Status: implemented

English | [中文](2026-08-29-the-configuration-file-ssh-will-open.zh.md)

## Problem

`SshHosts` resolved its default configuration file as `join(homedir(), '.ssh', 'config')`. `os.homedir()` returns `$HOME` when it is set. **OpenSSH does not**: it expands `~` from the password database and ignores the environment.

So in any process whose `HOME` differs from its passwd home — a container, `sudo`, some desktop launchers — the book listed machines from one file while the connection read another. A person picked a machine that was visibly there, and the connection failed with

```
ssh: Could not resolve hostname testbox: Temporary failure in name resolution
```

because to a client that never saw the alias, the alias was only ever a hostname. The package's own `Config` documentation already stated the contract this broke: a machine is reachable here exactly when it is reachable from the person's terminal.

It surfaced while reproducing an unrelated report against a disposable sshd, in a harness deliberately launched with a fake `HOME`. That is a real deployment shape, not only a test artifact.

## Decision

**The default is resolved the way OpenSSH resolves it.** `sshUserHome()` reads `userInfo().homedir`, which is the passwd entry, and falls back to `os.homedir()` only where the running uid has no entry — a case where OpenSSH itself fails the same way, so the two still agree.

**A configured path keeps steering both halves.** Naming a file in `Config.configPath` already put `-F` on every invocation, so the list and the connection cannot disagree there either.

**The default still passes no `-F`.** `ssh -F <file>` suppresses the system-wide `/etc/ssh/ssh_config`, which carries `Match` blocks and `ProxyCommand` entries in managed environments. Passing the resolved path explicitly would have made the two halves agree by silently dropping a file the person's terminal reads.

## Alternatives considered

**Always pass `-F` with the resolved path.** The obvious fix, and it trades one divergence for another: the system-wide file stops applying, so a machine reachable from the terminal through an organisation's `ProxyCommand` becomes unreachable here. That is the same class of failure, with a quieter symptom.

**Leave the read side on `homedir()` and document the hazard.** The failure names a DNS problem for something that is not a DNS problem; nobody reading that message looks for a config-path mismatch.

**Set `HOME` for the ssh child to the passwd home.** Changes nothing — OpenSSH does not consult `HOME` for this — and would mislead the next reader into thinking it does.

## Consequences

The list and the connection read one file in every deployment shape, and the fix is invisible wherever `HOME` already matches the passwd entry, which is most of them. A person who deliberately points `HOME` at a portable configuration directory now sees the machines OpenSSH will actually use rather than the ones they staged there — the honest answer, and a behaviour change for that setup.

`resolve()` failures now also carry the client's exit code and the last lines of its stderr, so the next mismatch of this class names itself instead of arriving as a resolver error.

## Verification

The rule is pinned by a test that sets `HOME` to a directory that is not the passwd home and asserts the book still names the passwd home's file; reverting the resolution to `os.homedir()` turns it red. A second case pins that a configured path is used verbatim and reaches the invocation as `-F`.

The original failure was reproduced outside the app first — `env -i HOME=<fake> ssh -T testbox` fails to resolve the alias while the same alias is present in `<fake>/.ssh/config` — which is what identified the passwd rule as the cause rather than the harness.
