# @unieai/uad-ssh-server

English | [中文](README.zh.md)

A real OpenSSH server, started for one test run and thrown away.

## Why it exists

The suites that prove remote machines work used to be `describe.skipIf(!ready)`, gated on two environment variables naming a server someone had set up by hand. In every ordinary run — including CI — they skipped, **silently**, and the remote path shipped with no coverage at all.

Three defects reached a person that way:

- a routed subprocess provider constructed without the machine book it needs,
- a client left free to ask for a password on whatever terminal the process inherited, which stopped a command until somebody typed into a terminal they were not looking at,
- a configuration file resolved from `HOME` when OpenSSH reads the password database, so the list of machines and the connection read different files.

Every one is the kind a real connection catches on the first command.

So the server is started **by** the test. Skipping is no longer the default, and the only thing that can still cause it is server software that is not installed — which says so, and names the paths it looked in.

## What it is

Loopback only, on a port the OS picks, with a host key and a client key generated per run and deleted after. It authenticates by key and refuses passwords outright, so nothing in a suite can hang waiting for a human.

What that proves is what a mock cannot: the argv this repository builds is one the real client accepts, and the command arrives at the other end.

`DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS` still win when both are set, so anyone can point a suite at a real box instead.

## Model Experience

None, as this package is a test fixture and is not composed into any product runtime; it registers no tool, prompt, schema, or context.

#### KV Cache effect

None. It contributes no prompt fragment, tool definition, or context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **POSIX only.** The server is `sshd` from the host, looked for at three fixed paths; Windows has no equivalent here, so suites using it do not run there.
- **One account, the current user.** The generated configuration logs in as whoever runs the tests, so nothing that depends on being a *different* user on the far side can be expressed.
- **No sftp subsystem.** Only what an exec channel can do is exercised; a suite needing `sftp` would have to add the subsystem line and a server that has the binary.
- **Nothing simulates a slow or lossy link.** Every connection is loopback and instant, so timeouts and retry behavior are still only exercised by unit tests with injected clocks.
