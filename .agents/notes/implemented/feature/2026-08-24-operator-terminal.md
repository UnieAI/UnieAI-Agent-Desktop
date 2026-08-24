# Agent Note: The terminal a person drives

Status: implemented

English | [中文](2026-08-24-operator-terminal.zh.md)

## Problem

The harness had PTYs, and none of them were reachable by a human. `ctx.terminals` runs shells for the **model**: it fences every call to one live `Agent`, is read by polling a bounded window, and its bash backend runs `--noprofile --norc` so the model meets the same shell on every machine. Every one of those is right for a tool call and wrong for a person, who wants a session that outlives any one chat, output the moment it is produced, and their own prompt and aliases.

So Rabi's right-hand panel could show what a session produced and what was in the workspace, and could not show a terminal — the one surface a developer reaches for when the agent is not the right tool for the next thirty seconds.

## Decision

`@unieai/uad-terminal-operator` registers `OperatorTerminalService` as `ctx.operatorTerminals`, over the same `ctx.subprocess.spawnTerminal` primitive the agent's stack uses and sharing nothing else with it. A terminal opened there is invisible to the model, and a terminal the model opens is invisible in the panel.

The wire is a new `terminal` domain (`list/open/replay/write/resize/signal/close`) plus three `HostFrame` variants. `TerminalRuntime` on the browser side owns the calls and the subscriptions; `TerminalTab` renders one with xterm.js.

## Why each of these, and not the obvious alternative

**The shell is spawned with no flags.** `argv` is exactly `[shell]`. On a PTY, bash and its relatives decide they are interactive from the terminal alone and read the **interactive** rc file — `~/.bashrc`, which is where oh-my-bash, starship, aliases and the prompt live. `-l` would make it a **login** shell, which reads `~/.bash_profile` or `~/.profile` and skips `~/.bashrc` unless one of those sources it; a user whose whole configuration is in `.bashrc` would be handed a bare `$` prompt on a machine they had configured carefully. Linux terminal emulators spawn the interactive non-login shell for exactly this reason.

**Output rides the HOST event stream, not the mux stream.** Every `MuxFrame` carries a `sessionId`. Scoping terminal output that way would have tied a shell's life to a chat: opening a new conversation would kill a running `npm run dev`. `HostFrame` already carries workspace-scoped frames, and a terminal belongs to a workspace.

**Terminals are loopback-pinned, and the panel does NOT hide the row off loopback.** The seven methods are in `PRIVILEGED_METHODS`, so a non-loopback caller gets 403 — that is the fence. An earlier revision ALSO hid the menu row when the client believed it was not on loopback, which meant a person reaching the app through a tunnel, a port forward, or `localhost` rather than `127.0.0.1` found the feature silently missing with nothing to read. A row that opens and then says why it could not is a surface someone can act on; a row that is not there is not.

**Sizes are clamped, not refused.** The caller is a layout. A panel that is hidden, still mounting, or mid-drag measures zero or a fraction, and the PTY rejects both; refusing would turn an ordinary render into a failed keystroke.

**Opening the tab reattaches.** A terminal outliving its panel is the whole point, so a tab that always opened a NEW shell stranded the previous one — still running, invisible, and counting against the per-workspace bound until it was the only thing the user could hit. The tab adopts the workspace's live terminal and only opens when there is none; closing the tab ends it.

## Testing

31 package tests over a fake subprocess seam, 13 over a fake wire; both pin behaviour a person can name — keystrokes arrive in order, a clamped size reaches the PTY, a closed terminal refuses input, reopening reattaches. The end-to-end proof is a real browser against a real Host: a real bash, its own prompt from `~/.bashrc`, a typed line executed and answered.

## Alternatives considered

**Reuse `ctx.terminals` with a non-Agent owner.** Its ownership fence, its polling read model, and its profile-free shell would each have needed an exception, and every exception would have been a branch inside a registry whose whole contract is that the owner is one live Agent. Two registries over one primitive is less machinery than one registry with two contracts.

**Carry output on the mux stream with a session id.** Rejected because it makes a shell die when the user opens a new chat — see the decision above.

**Gate the terminal on the signed-in account instead of loopback.** Raised with the owner when the loopback pin looked like it would make the feature useless on the deployed `uac.unieai.com`. The owner settled it: Rabi is the single-machine edition and is reached over `127.0.0.1`, so a loopback-only feature is correct rather than a gap. The pin stays; only the client-side HIDING of the row was wrong.

**Write the terminal renderer by hand.** A shell and the full-screen programs it runs address the cursor, repaint regions, swap to an alternate screen, and colour by escape sequence. Anything less than a real emulator turns `vim`, `htop` and even a coloured prompt into rubbish on screen.

## Consequences

The panel can now run any command as the account that started the Host — which is what a terminal is, and why the methods are loopback-pinned and the deployment can remove the surface with `enabled: false`. It is not a sandbox.

xterm.js and its fit addon are new browser dependencies; xterm's global stylesheet loads in the app shell rather than the panel's package, because its class names are written into the DOM by the library (CSS modules would rename them) and because tsdown does not resolve a bare package specifier for CSS.

`terminal.*` joins `PRIVILEGED_METHODS`, and the host event stream now filters `terminal/*` frames for a peer that is not loopback — a browser that may not open a terminal must not read one either.

## Three bugs a real browser found that the tests did not

None of these appear in unit tests, and all three would have shipped.

1. **`cannot get property "panelTerminals" without inject`.** The package reached a service it had not declared. The panel showed that sentence where the shell should have been.

2. **Keystrokes arrived out of order.** Each keystroke is its own HTTP request, and HTTP promises nothing about the order two in-flight requests complete in. Typing `echo` produced `ecoh` on a real shell. Writes are now chained per terminal — per terminal, so two panels do not wait on each other, and a failed write does not poison the chain, because a terminal that stays dead after one dropped packet is worse than one that lost a character.

3. **An effect depended on the state its own callback wrote.** `TerminalTab`'s effect listed `onAttached` among its dependencies; `onAttached` calls `setState`, which re-renders, which rebuilds the inline callback, which re-runs the effect. Every pass tore down the renderer and attached a new one, so keystrokes landed in xterm instances that were already being disposed and only the LAST character of a typed line survived. The seam and the callbacks live in a ref now, and the effect keys on the workspace alone.

The same class of mistake as the file tree that stuck on "loading": an effect that reads what it writes.

## Deliberately not done

- **The panel is unreachable from the home screen.** `AppFrame` forces the details column to zero width without a current non-blank session, and the `details` slot is session-scoped. Reaching a terminal from a blank screen means changing that contract, which is a separate change with its own blast radius.
- **No keyboard shortcuts.** The reference design shows one per menu row. None are bound here, and a hint beside a row that does nothing when pressed teaches someone the menu lies.
- **No session persistence.** A terminal does not survive an app restart; its scrollback lives in memory only.
