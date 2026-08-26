/**
 * Package-owned invariant companion for `@unieai/uad-studio-kb-sources`.
 * @module @unieai/uad-studio-kb-sources/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-studio-kb-sources'

/** Cordis companion plugin name. */
export const name = 'studio-kb-sources-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a pure reader over text another
 * plugin already produced. It owns no stream, no storage and no registration,
 * so there is no relationship between two live things for a check to hold.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
