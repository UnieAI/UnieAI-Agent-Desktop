/**
 * Operator-terminal domain: the terminal a PERSON drives, over the wire.
 *
 * Every method here is loopback-pinned (`PRIVILEGED_METHODS` in
 * `@unieai/uad-client-connection`), because a terminal runs any command as the
 * account that started the Host. The model reaches PTYs through its own tools
 * over `ctx.terminals` and cannot see or touch anything in this domain.
 *
 * Output does NOT come back through these calls. A shell speaks whenever it
 * likes, including long after the call that started it returned, so output
 * rides the host event stream as `terminal/output` frames.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Signals the GUI may deliver to a terminal's foreground process group. */
export type TerminalSignalName = 'SIGINT' | 'SIGTERM' | 'SIGQUIT' | 'SIGTSTP'

/** One live or finished operator terminal, as a client renders it. */
export interface TerminalView {
  /** Identity minted at open; stable for the terminal's whole life. */
  terminalId: string
  /** Workspace whose directory the shell started in. */
  workspaceId: string
  /** Absolute directory the shell started in. */
  cwd: string
  /** Program the terminal is running, as spawned. */
  shell: string
  /** What a tab calls this terminal: `user@host`, as a terminal emulator titles its window. */
  title: string
  /** Last size the client reported. */
  cols: number
  /** Last size the client reported. */
  rows: number
  /** False once the shell has exited; the scrollback stays readable. */
  live: boolean
  /** Exit code once the shell has exited and the platform reported one. */
  exitCode?: number
}

/** terminal.open / terminal.replay response value. */
export interface TerminalOpened {
  /** The terminal itself. */
  terminal: TerminalView
  /**
   * Output retained so far, so a panel paints what already happened instead of
   * a blank rectangle in front of a shell that is still running.
   */
  replay: string
}

/** Operator-terminal domain surface. */
export interface TerminalApi {
  /**
   * Every terminal the Host holds, live or finished.
   *
   * Sent whole rather than as a delta because a second tab and a reconnecting
   * browser have to converge on the same list.
   */
  list(request: RpcRequest<{}>, signal: AbortSignal): Promise<RpcResponse<{ terminals: TerminalView[] }>>

  /**
   * Open a terminal in a workspace directory.
   *
   * `cwd` must be a path the workspace registry already holds: a page cannot
   * name an arbitrary directory to start a shell in. The size is what the
   * panel currently measures; it is clamped, not refused, because a hidden or
   * half-mounted panel measures zero.
   */
  open(
    request: RpcRequest<{ workspaceId: string; cwd: string; cols: number; rows: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<TerminalOpened>>

  /**
   * Re-read one terminal's retained output, for a panel that was closed and
   * reopened without the terminal having ended.
   */
  replay(
    request: RpcRequest<{ terminalId: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<TerminalOpened>>

  /**
   * Deliver keystrokes. The text is written verbatim — no newline is added,
   * because the client decides what Enter means.
   */
  write(
    request: RpcRequest<{ terminalId: string; data: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** Tell a terminal its panel changed size. */
  resize(
    request: RpcRequest<{ terminalId: string; cols: number; rows: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /**
   * Signal the foreground process group, which is what Ctrl-C means: the
   * signal must reach `sleep 100`, not the shell waiting on it.
   */
  signal(
    request: RpcRequest<{ terminalId: string; signal: TerminalSignalName }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>

  /** End a terminal and forget it, including its retained output. */
  close(
    request: RpcRequest<{ terminalId: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{}>>
}
