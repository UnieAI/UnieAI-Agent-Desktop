/**
 * Package-owned invariant companion for `@unieai/uad-fs-ssh`.
 * @module @unieai/uad-fs-ssh/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-fs-ssh'

/** Cordis companion plugin name. */
export const name = 'fs-ssh-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the provider holds no state to reconcile. Every
 * answer is read from the machine on the call that needs it, and the only
 * file it creates of its own — a staging file beside a write's target — is
 * published or removed before that write returns.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
