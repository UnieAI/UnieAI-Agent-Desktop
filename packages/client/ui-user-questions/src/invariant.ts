/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-user-questions`.
 * @module @unieai/uad-client-ui-user-questions/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-user-questions'

/** Cordis companion plugin name. */
export const name = 'client-ui-user-questions-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: tool and slot registrations are effects
 * owned and observed by their respective registries; the host pending table is
 * exercised through the public wire protocol.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
