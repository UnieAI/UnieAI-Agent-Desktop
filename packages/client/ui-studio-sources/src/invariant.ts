/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-studio-sources`.
 * @module @unieai/uad-client-ui-studio-sources/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-studio-sources'

/** Cordis companion plugin name. */
export const name = 'ui-studio-sources-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the node half registers nothing, and the browser half
 * derives its rows from a tool result the conversation snapshot already holds
 * — there is no owned stream or durable record to reconcile against.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
