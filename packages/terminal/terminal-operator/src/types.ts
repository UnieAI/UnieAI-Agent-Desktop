/**
 * Contract for the terminal a person drives. Every type here describes a
 * session a human opened in the GUI, never one an agent owns: the model-facing
 * PTY stack lives behind `ctx.terminals` and shares nothing with this one.
 * @module @unieai/uad-terminal-operator/types
 */

/** Opaque identity minted for one operator-driven terminal. */
export type OperatorTerminalId = string & { readonly __operatorTerminal: unique symbol }

/** Machine-routable operator-terminal failures. */
export type OperatorTerminalErrorCode =
  | 'DISABLED'
  | 'NO_TERMINAL'
  | 'TOO_MANY_TERMINALS'
  | 'NO_SHELL'
  | 'EXITED'

/** One operator-terminal failure a caller can branch on without parsing prose. */
export class OperatorTerminalError extends Error {
  constructor(readonly code: OperatorTerminalErrorCode, message: string) {
    super(message)
    this.name = 'OperatorTerminalError'
  }
}

/** Signals the GUI may deliver to a terminal's foreground group. */
export type OperatorTerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGQUIT' | 'SIGTSTP'

/** What one live or finished operator terminal looks like to a client. */
export interface OperatorTerminalView {
  /** Identity minted at open; stable for the terminal's whole life. */
  terminalId: OperatorTerminalId
  /** Workspace whose directory the shell started in. */
  workspaceId: string
  /** Absolute directory the shell started in. */
  cwd: string
  /** Program the terminal is running, as spawned. */
  shell: string
  /**
   * What a tab calls this terminal: `user@host`, the way a terminal emulator
   * titles its window. It names the machine the shell is ON, which is the fact
   * a person needs when the app can also reach other places — `Terminal` names
   * only the kind of thing it is, which the icon already says.
   */
  title: string
  /** Last size the client reported. */
  cols: number
  /** Last size the client reported. */
  rows: number
  /** False once the shell has exited; the scrollback stays readable. */
  live: boolean
  /** Exit code once the shell has exited and the platform reported one. */
  exitCode?: number | undefined
}

/** What a client must supply to open a terminal. */
export interface OperatorTerminalOpenSpec {
  /** Workspace whose directory the shell starts in. */
  workspaceId: string
  /** Absolute directory the shell starts in. */
  cwd: string
  /** Initial column count; clamped to at least 1. */
  cols: number
  /** Initial row count; clamped to at least 1. */
  rows: number
}
