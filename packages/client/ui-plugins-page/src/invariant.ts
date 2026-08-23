/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-plugins-page`.
 * @module @unieai/uad-client-ui-plugins-page/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-plugins-page'

/** Cordis companion plugin name. */
export const name = 'client-ui-plugins-page-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin — it emits no cordis events,
 * and the one piece of mutable state it owns (whether the page is open) is
 * private to this package's own registrations, read through the hooks
 * compartment and written through injected callbacks. Its slot registrations
 * are plain effects whose disposal the slot ledger's own specs and this
 * package's behavior specs observe directly.
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
