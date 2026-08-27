/**
 * Package-owned invariant companion for `@unieai/uad-remote-machine`.
 * @module @unieai/uad-remote-machine/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-remote-machine'

/** Cordis companion plugin name. */
export const name = 'remote-machine-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the bundle is a composition patch and registers
 * nothing at runtime. What it composes — the machine book and the two
 * execution-world providers — each owns its own companion.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
