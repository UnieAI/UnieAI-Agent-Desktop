/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-unieai-mcp-supervisor`.
 * @module @deepseek-ai/dsh-unieai-mcp-supervisor/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-unieai-mcp-supervisor'

/** Cordis companion plugin name. */
export const name = 'unieai-mcp-supervisor-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the mount registry is private to one plugin instance
 * and publishes no event stream a companion could reconcile against. Each
 * mounted server is a child fiber released by the effect that created it, and
 * the tool registrations it contributes are `dsh-mcp-client`'s to account for.
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
