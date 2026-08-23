/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-unieai-web-gate`.
 * @module @deepseek-ai/dsh-unieai-web-gate/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-unieai-web-gate'

/** Cordis companion plugin name. */
export const name = 'unieai-web-gate-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the session table is private to one plugin instance
 * and has no companion stream to reconcile against; every registration leaves
 * through its own effect.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
