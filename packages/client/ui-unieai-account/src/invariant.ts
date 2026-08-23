/**
 * Package-owned invariant companion for `@unieai/uad-client-ui-unieai-account`.
 * @module @unieai/uad-client-ui-unieai-account/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-client-ui-unieai-account'

/** Cordis companion plugin name. */
export const name = 'client-ui-unieai-account-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the section holds no durable state of its own and
 * every account fact belongs to the gateway that supplies it, whose own
 * package will audit the token and request rules. What this package can get
 * wrong — slot declaration, registration, teardown — is exercised here.
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
