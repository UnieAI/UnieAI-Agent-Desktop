/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-unieai-providers`.
 * @module @deepseek-ai/dsh-client-ui-unieai-providers/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-unieai-providers'

/** Cordis companion plugin name. */
export const name = 'client-ui-unieai-providers-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package holds no durable state and mirrors a list
 * the web product owns, so there is no local relation between an event and a
 * datum for a reporter to audit. The rule this surface must not break — that a
 * provider credential travels only towards the product, never back — is a
 * property of the host route's wire shape and is asserted where that shape is
 * built, in `@deepseek-ai/dsh-unieai-web-gate`.
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
