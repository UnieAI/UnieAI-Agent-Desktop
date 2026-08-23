/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-unieai-bootstrap`.
 * @module @deepseek-ai/dsh-client-unieai-bootstrap/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-unieai-bootstrap'

/** Cordis companion plugin name. */
export const name = 'client-unieai-bootstrap-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable data and emits no event
 * stream. Its only mutable state is one in-memory startup snapshot whose
 * status projection and at-most-one-follow-up read are checked directly by the
 * package suites, and the credential the parts were gathered with never leaves
 * the host.
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
