# Agent Note: the suite starts its own server, because skipping was the default

Status: implemented

English | [中文](2026-08-29-the-server-the-suite-starts-for-itself.zh.md)

## Problem

Four suites proved that remote machines work: the machine book against a real server, files on a real machine, one world over one machine, and switching between machines. All four were `describe.skipIf(!ready)`, where `ready` meant two environment variables naming a server someone had set up by hand.

In every ordinary run, and in CI, all four **skipped silently**. Thirty-two tests reported as absent rather than as unrun, and the remote path shipped with no automated coverage at all.

Three defects reached a person through that gap, and every one of them is what a real connection catches on its first command:

- a routed subprocess provider constructed without the machine book it needs, so selecting a remote machine made *every* command fail — including a local `echo` — with `cannot get property "ssh" without inject`;
- a client left free to ask for a password on whatever terminal the process inherited, which stopped a command until somebody typed into a terminal they were not looking at;
- a configuration file resolved from `HOME` when OpenSSH reads the password database, so the list of machines and the connection could read different files.

The unit tests could not see the first: a service constructed against a bare `Context` becomes a direct property, and the context proxy answers it without consulting injection at all. Only a composition mounts services into fibers, and only then is an undeclared read refused.

## Decision

**The suite starts the server.** `@unieai/uad-ssh-server` runs the host's `sshd` on loopback, on a port the OS picks, with a host key and a client key generated for that run and deleted after. It authenticates by key and refuses passwords outright, so nothing in a suite can hang waiting for a human.

`DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS` still win when both are set, so anyone can point a suite at a real box. What changed is the fallback: it was "skip everything", and it is now "start one".

**Skipping survives for exactly one reason, and it names itself.** A machine with no `sshd` cannot run the fixture, and the message says which paths were searched and which two variables would name a server instead. Silence is what this replaces.

**The fixture is proven, not assumed.** A fixture that "runs" against a server that is not there would replace one silence with another, so its own tests connect with the real client and assert `SSH_CONNECTION` — set by sshd and by nothing else — because on loopback a hostname proves nothing. A third case takes away the only authentication method the server accepts and asserts a refusal rather than a prompt.

## Alternatives considered

**A mock ssh binary on PATH.** Cheap, and it proves only that this repository can call something it also wrote. The argv is the interesting part precisely because a real client is what has to accept it.

**A container.** Reproducible and heavy: it needs a runtime present in CI and on every developer's machine, and it is a much larger dependency than a binary most POSIX systems already ship.

**Keep the environment gate and set it in CI.** It fixes CI and leaves every local run uncovered — and the local run is where these three defects would first have been felt.

**Leave the suites skipped and rely on manual testing.** That is the state that produced the defects.

## Consequences

Thirty-two remote tests now run on every `test:e2e`: seven for the machine book, fifteen for files, four for one world, six for switching. A regression in the argv, the injection, or the prompt policy is caught before anyone installs it.

The cost is a dependency on `sshd` being installed. On a machine without it the suites still skip — but they say so, and the message is actionable, which is the difference between coverage that is missing and coverage nobody knew was missing.

## Verification

Against a clean tree the e2e run reported 35 passed and 34 skipped; with the fixture it reports 39 passed and 30 skipped, and each of the four suites was run alone to confirm it executes rather than skips.

The fixture's own three tests pass against a server it starts, including the `SSH_CONNECTION` assertion that proves the command crossed a connection.
