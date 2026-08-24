# @unieai/uad-terminal-operator

English | [中文](README.zh.md)

The terminal a **person** drives. `OperatorTerminalService` registers as `ctx.operatorTerminals`, opens interactive shell sessions over `ctx.subprocess.spawnTerminal`, streams their output as cordis events, and scopes every session to a workspace rather than to a chat.

## Why this is not the model-facing PTY stack

`ctx.terminals` ([`terminal`](../terminal/README.md)) already runs shells, and this package deliberately does not reuse it. The three things that make it right for a model make it wrong for a person:

- It **fences every operation to one live `Agent`**. A human terminal has no agent behind it, and must survive the session that happened to be open when it was opened.
- It is **read by polling** (`TerminalReadRequest` returns a bounded window). A terminal emulator needs output the moment it is produced; a person typing into a `read`-loop notices tens of milliseconds.
- Its bash backend runs **`--noprofile --norc`**, on purpose: the model must meet the same shell on every machine. A person wants the opposite — their prompt, their aliases, their completions.

So this owns its own registry over the same subprocess primitive and shares nothing with that one. A terminal opened here is invisible to the model, and a terminal the model opens is invisible here.

## The shell is spawned with no flags

`argv` is exactly `[shell]`. On a PTY, bash and its relatives decide they are interactive from the terminal alone and read the **interactive** rc file — `~/.bashrc` — which is where oh-my-bash, starship, aliases and the prompt actually live. Adding `-l` would make it a **login** shell instead, which reads `~/.bash_profile` or `~/.profile` and skips `~/.bashrc` unless one of those happens to source it; a user whose whole configuration is in `.bashrc` would be handed a bare `$` prompt on a machine they have configured carefully. Linux terminal emulators spawn the interactive non-login shell for exactly this reason.

The program is `$SHELL` when it is absolute and executable, then `/bin/bash`, then `/bin/sh`. A **relative** `$SHELL` is ignored rather than resolved through `PATH`: the search would run under the app's `PATH`, which is not necessarily the one the user's login shell was found on, and a same-named different binary is worse than the documented fallback. `TERM` is set to `xterm-256color` and `COLORTERM` to `truecolor`, because the shell and every full-screen program it runs read them to decide which escape sequences they may emit.

## Contract

- Terminals are **workspace-scoped**. A shell running `npm run dev` does not die because the user started a new conversation; it dies when the workspace's terminal is closed or the process exits.
- `open` bounds live terminals per workspace (`maxTerminalsPerWorkspace`), and a shell that exits frees its slot. A different workspace has its own budget.
- Output is published as `operator-terminal/output` and **also retained** in a byte-bounded `Scrollback`, so a reopened panel or a reconnected browser can repaint instead of facing a blank rectangle in front of a shell that is still running. Trimming drops whole chunks from the front, which can begin a repaint partway through an escape sequence; that is what a terminal emulator does when its own scrollback overflows, and the renderer resynchronizes on the next complete sequence.
- Sizes are **clamped, not refused**. The caller is a layout: a panel that is hidden, still mounting, or mid-drag measures zero or a fraction, and the PTY rejects both. Refusing would turn an ordinary render into a failed keystroke.
- `signal` targets the **foreground process group**, which is what Ctrl-C means. `SIGQUIT` degrades to `SIGTERM` because the subprocess seam permits no `SIGQUIT` and a signal a person cannot deliver is worse than the closest one that works.
- `close` produces exactly one list change, not a change and an exit: the client asked for it, so no exit is announced for it.
- A terminal that has exited keeps its scrollback readable and refuses input with `EXITED`.

## Model Experience

None, as the package registers no tool and contributes nothing to any prompt; a session opened here is invisible to the model, which reaches PTYs only through `tool-terminal` over `ctx.terminals`.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **This tab runs any command as the user who started the app.** That is what a terminal is; `enabled: false` removes the surface for a deployment that does not want it. It is not a sandbox, and nothing here is model-reachable — but it is exactly as privileged as the person at the keyboard.
- No session persistence. A terminal does not survive an app restart; its scrollback lives in memory only.
- `SIGQUIT` is delivered as `SIGTERM` (above). Programs that distinguish them see the wrong one.
- Output is decoded as UTF-8 at chunk boundaries. A multi-byte character split across two PTY reads is reassembled by the stream decoder, but scrollback **eviction** cuts at chunk boundaries and can therefore drop a partial escape sequence from the front of a repaint.
