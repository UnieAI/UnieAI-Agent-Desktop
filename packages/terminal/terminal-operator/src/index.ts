/**
 * The terminal a person drives, as a Host service.
 *
 * This is deliberately NOT the model-facing PTY stack. `ctx.terminals` fences
 * every call to one live `Agent`, reads by polling, and its bash backend runs
 * `--noprofile --norc` so the model meets a shell that behaves the same on
 * every machine. A person wants the opposite of all three: a session that
 * outlives any one chat, output that arrives as it is produced, and their own
 * prompt, aliases and completions. So this owns its own registry over the
 * `ctx.subprocess.spawnTerminal` primitive and shares nothing with that one.
 *
 * Output leaves as a cordis event rather than a return value because a
 * terminal has no request/response shape: the shell speaks whenever it likes,
 * including long after the call that started it returned.
 * @module @unieai/uad-terminal-operator
 */

import { accessSync, constants } from 'node:fs'
import { hostname as osHostname } from 'node:os'
import { Context, Service } from '@unieai/cordis'
import z from '@unieai/schemastery'
import type { SubprocessTerminalHandle } from '@unieai/uad-subprocess'
import { validateConfig, type Config, type ResolvedConfig } from './config.ts'
import { Scrollback } from './scrollback.ts'
import { operatorTerminalEnv, operatorTerminalTitle, resolveOperatorShell } from './shell.ts'
import {
  OperatorTerminalError,
  type OperatorTerminalId,
  type OperatorTerminalOpenSpec,
  type OperatorTerminalSignal,
  type OperatorTerminalView,
} from './types.ts'

export { validateConfig } from './config.ts'
export type { Config, ResolvedConfig } from './config.ts'
export { Scrollback } from './scrollback.ts'
export { operatorTerminalEnv, operatorTerminalTitle, resolveOperatorShell } from './shell.ts'
export {
  OperatorTerminalError,
  type OperatorTerminalErrorCode,
  type OperatorTerminalId,
  type OperatorTerminalOpenSpec,
  type OperatorTerminalSignal,
  type OperatorTerminalView,
} from './types.ts'

declare module '@unieai/cordis' {
  interface Context {
    operatorTerminals: OperatorTerminalService
  }
  interface Events {
    /**
     * Output produced by one operator terminal, in delivery order.
     * @param terminalId - the terminal that produced it.
     * @param chunk - UTF-8 text exactly as the PTY delivered it.
     * @mode emit
     */
    'operator-terminal/output': (terminalId: OperatorTerminalId, chunk: string) => void
    /**
     * One operator terminal's shell exited; the terminal keeps its scrollback.
     * @param terminalId - the terminal that ended.
     * @param exitCode - platform exit code when one was reported.
     * @mode emit
     */
    'operator-terminal/exited': (terminalId: OperatorTerminalId, exitCode?: number) => void
    /**
     * The set of operator terminals changed: one opened, or one was closed and
     * forgotten. Sent whole because a reconnecting client has to converge on
     * the same list a second tab sees.
     * @param terminals - every terminal the service still holds.
     * @mode emit
     */
    'operator-terminal/changed': (terminals: OperatorTerminalView[]) => void
  }
}

/** One live or finished terminal and everything the service holds for it. */
interface TerminalRecord {
  view: OperatorTerminalView
  handle: SubprocessTerminalHandle
  scrollback: Scrollback
}

/** Filesystem probe the service uses to resolve a shell; injectable for tests. */
export interface ShellProbe {
  /**
   * @param path - absolute path to test.
   * @returns whether an executable file is present there.
   */
  exists(path: string): boolean
}

/**
 * Registry of the terminals a person opened in the GUI.
 *
 * Terminals are scoped to a workspace, not to a chat session: a shell running
 * `npm run dev` must not die because the user started a new conversation.
 */
export class OperatorTerminalService extends Service {
  static inject = ['subprocess']
  // The schema is written HERE rather than imported from config.ts: the config
  // catalog gate walks this expression statically, and an imported identifier
  // is a name it cannot follow. The `Config` interface and its range checks
  // stay next door.
  static Config: z<Config> = z.object({
    enabled: z.boolean().default(true),
    shellPath: z.string().required(false),
    scrollbackMaxBytes: z.number().default(1024 * 1024),
    maxTerminalsPerWorkspace: z.number().default(4),
    disposeGraceMs: z.number().default(3_000),
  })

  private readonly terminals = new Map<OperatorTerminalId, TerminalRecord>()
  private readonly config: ResolvedConfig
  private nextId = 0
  private disposing = false

  /**
   * @param ctx - Host plugin context.
   * @param config - plugin config; Schemastery defaults are already applied.
   * @param probe - executable-presence test; the real filesystem by default.
   * @param env - environment the shell inherits; this process's by default.
   * @param hostname - this machine's name, for the tab title; the real one by default.
   */
  constructor(
    ctx: Context,
    config: Config,
    private readonly probe: ShellProbe = FILESYSTEM_SHELL_PROBE,
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly hostname: () => string = osHostname,
  ) {
    super(ctx, 'operatorTerminals')
    validateConfig(config)
    this.config = config
    ctx.effect(() => () => this.disposeAll(), 'operator terminal teardown')
  }

  /**
   * Open one terminal in a workspace directory.
   * @param spec - workspace, directory, and the client's current size.
   * @returns the new terminal's view.
   */
  async open(spec: OperatorTerminalOpenSpec): Promise<OperatorTerminalView> {
    if (!this.config.enabled) {
      throw new OperatorTerminalError('DISABLED', 'the operator terminal is turned off for this deployment')
    }
    const live = [...this.terminals.values()]
      .filter(record => record.view.live && record.view.workspaceId === spec.workspaceId)
    if (live.length >= this.config.maxTerminalsPerWorkspace) {
      throw new OperatorTerminalError(
        'TOO_MANY_TERMINALS',
        `this workspace already has ${String(live.length)} open terminals`,
      )
    }
    const shell = this.config.shellPath !== undefined && this.config.shellPath.length > 0
      ? this.config.shellPath
      : resolveOperatorShell(this.env, path => this.probe.exists(path))
    if (shell === undefined) {
      throw new OperatorTerminalError('NO_SHELL', 'no runnable shell found via $SHELL, /bin/bash, or /bin/sh')
    }
    const handle = await this.ctx.subprocess.spawnTerminal({
      argv: [shell],
      cwd: spec.cwd,
      env: operatorTerminalEnv(this.env),
      cols: clampSize(spec.cols),
      rows: clampSize(spec.rows),
      graceMs: this.config.disposeGraceMs,
    })
    const terminalId = `operator-${String(this.nextId++)}` as OperatorTerminalId
    const record: TerminalRecord = {
      view: {
        terminalId,
        workspaceId: spec.workspaceId,
        cwd: spec.cwd,
        shell,
        title: operatorTerminalTitle(this.env, this.hostname()),
        cols: clampSize(spec.cols),
        rows: clampSize(spec.rows),
        live: true,
      },
      handle,
      scrollback: new Scrollback(this.config.scrollbackMaxBytes),
    }
    this.terminals.set(terminalId, record)
    this.pump(record)
    this.ctx.emit('operator-terminal/changed', this.list())
    return { ...record.view }
  }

  /**
   * Deliver keystrokes to a terminal.
   * @param terminalId - the terminal to write to.
   * @param data - text exactly as typed; no newline is added.
   */
  async write(terminalId: OperatorTerminalId, data: string): Promise<void> {
    await this.live(terminalId).handle.write(data)
  }

  /**
   * Tell a terminal its panel changed size.
   * @param terminalId - the terminal to resize.
   * @param cols - column count reported by the client.
   * @param rows - row count reported by the client.
   */
  async resize(terminalId: OperatorTerminalId, cols: number, rows: number): Promise<void> {
    const record = this.live(terminalId)
    record.view.cols = clampSize(cols)
    record.view.rows = clampSize(rows)
    await record.handle.resize(record.view.cols, record.view.rows)
  }

  /**
   * Deliver a signal to a terminal's foreground process group, which is what
   * Ctrl-C in a real terminal does.
   * @param terminalId - the terminal to signal.
   * @param signal - the signal to deliver.
   */
  async signal(terminalId: OperatorTerminalId, signal: OperatorTerminalSignal): Promise<void> {
    // SIGQUIT is not in the subprocess seam's permitted set; the GUI offers it
    // because a terminal does, so it degrades to the terminate signal rather
    // than failing a keystroke.
    const delivered = signal === 'SIGQUIT' ? 'SIGTERM' : signal
    await this.live(terminalId).handle.signalForeground(delivered)
  }

  /**
   * Everything retained for a terminal, so a reopened panel can repaint.
   * @param terminalId - the terminal to read.
   * @returns its retained output in delivery order.
   */
  replay(terminalId: OperatorTerminalId): string {
    return this.record(terminalId).scrollback.read()
  }

  /**
   * Project every terminal this service holds, so a reconnecting client and a
   * second tab converge on the same list.
   * @returns a view of every terminal the service holds, live or finished.
   */
  list(): OperatorTerminalView[] {
    return [...this.terminals.values()].map(record => ({ ...record.view }))
  }

  /**
   * End a terminal and forget it, including its scrollback.
   * @param terminalId - the terminal to close.
   */
  async close(terminalId: OperatorTerminalId): Promise<void> {
    const record = this.terminals.get(terminalId)
    if (record === undefined) return
    this.terminals.delete(terminalId)
    // Marked finished before terminating so the handle's own settlement does
    // not publish an exit for a terminal the client already asked to close;
    // one close must produce exactly one list change, not a change and an exit.
    record.view.live = false
    record.scrollback.clear()
    await record.handle.terminate()
    if (!this.disposing) this.ctx.emit('operator-terminal/changed', this.list())
  }

  /**
   * Forward one terminal's output until it ends, then publish the exit.
   * @param record - the terminal to follow.
   */
  private pump(record: TerminalRecord): void {
    record.handle.output.setEncoding('utf8')
    record.handle.output.on('data', (chunk: string) => {
      record.scrollback.push(chunk)
      this.ctx.emit('operator-terminal/output', record.view.terminalId, chunk)
    })
    void record.handle.done.then(
      (outcome) => { this.settle(record, outcome.exitCode ?? undefined) },
      // A transport failure ends the terminal exactly as an exit does: the
      // panel must stop accepting keystrokes either way, and the distinction
      // is not one a person can act on.
      () => { this.settle(record, undefined) },
    )
  }

  /**
   * Mark a terminal finished and tell its watchers once.
   * @param record - the terminal that ended.
   * @param exitCode - platform exit code when one was reported.
   */
  private settle(record: TerminalRecord, exitCode: number | undefined): void {
    if (!record.view.live) return
    record.view.live = false
    record.view.exitCode = exitCode
    if (this.disposing) return
    this.ctx.emit('operator-terminal/exited', record.view.terminalId, exitCode)
    this.ctx.emit('operator-terminal/changed', this.list())
  }

  /**
   * @param terminalId - the terminal to look up.
   * @returns its record.
   */
  private record(terminalId: OperatorTerminalId): TerminalRecord {
    const record = this.terminals.get(terminalId)
    if (record === undefined) throw new OperatorTerminalError('NO_TERMINAL', `no terminal ${terminalId}`)
    return record
  }

  /**
   * @param terminalId - the terminal to look up.
   * @returns its record, having proved the shell is still running.
   */
  private live(terminalId: OperatorTerminalId): TerminalRecord {
    const record = this.record(terminalId)
    if (!record.view.live) throw new OperatorTerminalError('EXITED', `terminal ${terminalId} has exited`)
    return record
  }

  /** Terminate every terminal and await quiescence. */
  private async disposeAll(): Promise<void> {
    this.disposing = true
    const records = [...this.terminals.values()]
    this.terminals.clear()
    await Promise.all(records.map(async (record) => {
      record.scrollback.clear()
      await record.handle.terminate()
    }))
  }
}

/**
 * Clamp a client-reported dimension into what a PTY accepts.
 *
 * The caller is a layout, not a person: a panel that is hidden, still
 * mounting, or mid-drag measures zero or a fraction, and node-pty rejects
 * both. Refusing would turn an ordinary render into a failed keystroke, so a
 * nonsense size becomes the nearest sane one.
 * @param value - dimension as measured by the client.
 * @returns a positive integer.
 */
function clampSize(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.trunc(value))
}

/** Executable-presence test against the real filesystem. */
export const FILESYSTEM_SHELL_PROBE: ShellProbe = {
  exists(path: string): boolean {
    try {
      accessSync(path, constants.X_OK)
      return true
    } catch {
      return false
    }
  },
}

export default OperatorTerminalService
