/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-pet`.
 * @module @unieai/uad-client-ui-pet/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-pet'

/** Cordis companion plugin name. */
export const name = 'ui-pet-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the node half owns one static route and one settings
 * section, both withdrawn by their own effects, and the mascot itself is a
 * browser drawing with no durable stream to reconcile against.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
