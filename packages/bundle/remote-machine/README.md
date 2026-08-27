# @unieai/uad-remote-machine

English | [中文](README.zh.md)

The bundle that puts the execution world on a machine reached over SSH. Everything else stays exactly where it was.

## What it changes

Two rows, and two rows only: `ctx.fs` and `ctx.subprocess`. Those two together define an execution world, so replacing them moves the Bash tool, the file tools, search, language servers and terminals onto the machine — and none of those packages changes or even learns that it happened.

The harness does not move. Cordis and the plugin objects, the agent loop, session state and persistence, model calls, prompts, tools and authority all stay on the computer Rabi is installed on. What crosses the wire is commands and file operations, nothing else.

Which machine comes from `DSH_SSH_MACHINE`, named as the person's own `~/.ssh/config` names it. There is no second machine book, and no credential is stored here — OpenSSH keeps them.

## The security fact

The local sandbox rows are turned off, and that is deliberate rather than incidental: seatbelt, Landlock and the sandboxed executors confine processes on **this** computer, and there is nothing they can do about a process on another one. `sandbox-policy` therefore states `danger-full-access`, because a mode promising confinement no provider can deliver would fail at the first spawn instead of at load.

Work on the machine is bounded by that machine's own account permissions — the same ones the person gets from their own terminal — and by the harness's approval prompts, which still gate every tool call.

## Using it

```sh
DSH_SSH_MACHINE=build-box rabi --profile remote-machine "run the test suite"
```

`DSH_SSH_CWD` sets the directory on the machine that relative paths resolve against, and it must be the same directory in all three places the composition names it — the filesystem provider, the sandbox policy, and the Bash executor. They are set together here; an overlay that changes one must change all three, or paths will resolve in one world and run in another.

A runnable example of the same composition lives at [`examples/headless-agent/ssh.cordis.yml`](../../../examples/headless-agent/ssh.cordis.yml).

## Model Experience

None, as the bundle registers nothing at all: it is a composition patch, and the tools whose machine it changes each document their own model-facing contract.

#### KV Cache effect

None. No prompt fragment, tool definition, or context entry originates here.

## Known Limitations and Deferred Work

- **One machine per process.** The alias is configuration, so every session runs on the same machine. Choosing per workspace needs a router the harness does not have yet.
- **No local files.** With the execution world remote, the tools cannot reach the computer Rabi runs on at all — there is one world, and it is the machine's.
- **The local sandbox is off.** Stated above, repeated here because it is the fact most worth knowing before mounting this bundle.
