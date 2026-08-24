/**
 * Package-owned invariant companion for `@unieai/uad-terminal-operator`.
 * @module @unieai/uad-terminal-operator/invariant
 */

import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'
import type { OperatorTerminalId, OperatorTerminalView } from './types.ts'

const PACKAGE_NAME = '@unieai/uad-terminal-operator'

/** Cordis companion plugin name. */
export const name = 'terminal-operator-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Death is final, and ids are unique.
 *
 * The panel's whole state machine reads from the published list: a terminal
 * that stopped being live has its input disabled and its exit code painted. If
 * one ever came back live — or if two rows shared an id — the panel would send
 * keystrokes into a dead PTY or render one terminal's output into another's
 * tab, and the resulting bug would look like a rendering fault rather than a
 * registry fault. Checking it where the list is published names the real
 * culprit at the moment it happens.
 */
const install: InvariantInstaller = (ctx: Context, fail) => {
  const buried = new Set<OperatorTerminalId>()
  ctx.on('operator-terminal/changed', (terminals: OperatorTerminalView[]) => {
    const seen = new Set<OperatorTerminalId>()
    for (const terminal of terminals) {
      if (seen.has(terminal.terminalId)) {
        fail(`published two operator terminals with id ${terminal.terminalId}`)
      }
      seen.add(terminal.terminalId)
      if (terminal.live && buried.has(terminal.terminalId)) {
        fail(`operator terminal ${terminal.terminalId} became live again after its shell exited`)
      }
      if (!terminal.live) buried.add(terminal.terminalId)
    }
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
