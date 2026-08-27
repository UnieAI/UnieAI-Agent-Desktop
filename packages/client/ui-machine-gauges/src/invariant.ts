/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-machine-gauges`.
 * @module @unieai/uad-client-ui-machine-gauges/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-machine-gauges'

/** Cordis companion plugin name. */
export const name = 'ui-machine-gauges-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the node half registers nothing, and the browser
 * half owns no durable state — every reading is the host's, taken on the
 * machine when this surface asks and kept only until the next poll replaces
 * it.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
