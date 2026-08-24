/**
 * Package-owned invariant companion for `@unieai/uad-upstream-names`.
 * @module @unieai/uad-upstream-names/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-upstream-names'

/** Cordis companion plugin name. */
export const name = 'upstream-names-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this pure name mapping owns no event stream or mutable runtime data; its
 * correctness is enforced by unit tests, including the round-trip against every workspace name.
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
