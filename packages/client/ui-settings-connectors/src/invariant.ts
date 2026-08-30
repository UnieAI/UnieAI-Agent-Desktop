/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-settings-connectors`.
 * @module @unieai/uad-client-ui-settings-connectors/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-settings-connectors'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-connectors-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable data and emits no event
 * stream. Every connector it shows is read from the host on demand, and the
 * grants themselves belong to `ctx.credentials`, whose own companion covers
 * them; the list-to-view projection and the in-flight rules are checked
 * directly by the package suites.
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
