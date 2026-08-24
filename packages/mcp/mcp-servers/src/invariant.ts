/**
 * Package-owned invariant companion for `@unieai/uad-mcp-servers`.
 * @module @unieai/uad-mcp-servers/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-mcp-servers'

/** Cordis companion plugin name. */
export const name = 'mcp-servers-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the mount registry is private to one plugin instance
 * and publishes no event stream a companion could reconcile against. The
 * durable list is the settings document's to account for, each mounted server
 * is a child fiber released by the effect that created it, and the tool
 * registrations it contributes are `uad-mcp-client`'s.
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
