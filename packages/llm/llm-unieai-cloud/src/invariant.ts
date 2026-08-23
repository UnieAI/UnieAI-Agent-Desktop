/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-llm-unieai-cloud`.
 * @module @deepseek-ai/dsh-llm-unieai-cloud/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-unieai-cloud'

/** Cordis companion plugin name. */
export const name = 'llm-unieai-cloud-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package holds one adapter registration and one
 * catalog snapshot, neither of which publishes an event stream a companion
 * could reconcile against. The registration leaves through its own effect, and
 * `dsh-llm` owns the route table it contributes to.
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
