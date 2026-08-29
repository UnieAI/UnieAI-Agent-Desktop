/**
 * Package-owned invariant companion for `@unieai/uad-ssh-server`.
 * @module @unieai/uad-ssh-server/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-ssh-server'

/** Cordis companion plugin name. */
export const name = 'ssh-server-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this fixture starts a server for a test process and owns no
 * Cordis event stream or shared data; that the server it starts is real, refuses passwords,
 * and is torn down is asserted by the package's own tests against the actual client.
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
