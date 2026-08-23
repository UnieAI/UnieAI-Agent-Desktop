/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-notifications`.
 * @module @deepseek-ai/dsh-client-ui-settings-notifications/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-notifications'

/** Cordis companion plugin name. */
export const name = 'client-ui-settings-notifications-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable data and emits no event
 * stream. It derives completion edges from the sessions list snapshot the
 * runtime already publishes, and its only persisted state is one per-device
 * localStorage key holding a sound id from a fixed catalog; both the edge
 * derivation and the storage round-trip are checked directly by the package
 * suites.
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
