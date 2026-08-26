/**
 * Package-owned invariant companion for `@unieai/uad-subprocess-ssh`.
 * @module @unieai/uad-subprocess-ssh/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-subprocess-ssh'

/** Cordis companion plugin name. */
export const name = 'subprocess-ssh-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider owns no durable data of its own. Live
 * process trees are the local provider's to account for, and the remote
 * side's only record is a pid file removed with the run that wrote it.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
