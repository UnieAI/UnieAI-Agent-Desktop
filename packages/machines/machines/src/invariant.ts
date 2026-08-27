/**
 * Package-owned invariant companion for `@unieai/uad-machines`.
 * @module @unieai/uad-machines/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-machines'

/** Cordis companion plugin name. */
export const name = 'machines-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no event stream and no mutable
 * data. Its answers are read from the person's OpenSSH configuration and
 * from the `ssh` client on every call, and the connections it opens are
 * owned by that client, not recorded here.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
