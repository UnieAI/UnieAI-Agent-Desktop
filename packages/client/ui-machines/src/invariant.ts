/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-machines`.
 * @module @unieai/uad-client-ui-machines/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-machines'

/** Cordis companion plugin name. */
export const name = 'ui-machines-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the node half registers nothing, and the browser
 * half owns no durable state — the machine list and the current choice are
 * the host's, read over the wire on each open.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
