/**
 * Package-owned invariant companion for `@unieai/uad-machine-metrics`.
 * @module @unieai/uad-machine-metrics/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-machine-metrics'

/** Cordis companion plugin name. */
export const name = 'machine-metrics-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no event stream and no durable
 * data. It keeps one processor reading between calls so a percentage can be
 * a difference, and that memory is rebuilt by the next sample — there is no
 * relation between an event and a state for an invariant to check.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
