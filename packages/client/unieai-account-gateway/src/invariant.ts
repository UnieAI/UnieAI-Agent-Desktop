/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-unieai-account-gateway`.
 * @module @deepseek-ai/dsh-client-unieai-account-gateway/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-unieai-account-gateway'

/** Cordis companion plugin name. */
export const name = 'client-unieai-account-gateway-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable data and emits no event
 * stream. Its only mutable state is one in-memory account state whose
 * reference-stability and mapping rules are checked directly by the package
 * suites, and the credential the figures come from never leaves the host.
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
