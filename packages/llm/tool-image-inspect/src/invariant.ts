/**
 * Package-owned invariant companion for `@unieai/uad-tool-image-inspect`.
 * @module @unieai/uad-tool-image-inspect/invariant
 */

import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-tool-image-inspect'

/** Cordis companion plugin name. */
export const name = 'tool-image-inspect-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Every delegated question goes to a route that declared it can see.
 *
 * The tool checks this before each call, and this checks that the check held:
 * a composition that swapped the configured route for a text-only one at
 * runtime would otherwise fail inside the provider, with a message about a
 * malformed request rather than about the model. Watched where the delegation
 * is announced, which is the moment the two can disagree.
 */
const install: InvariantInstaller = (ctx: Context, fail) => {
  ctx.on('tool-image-inspect/delegated', (route: string, sawImage: boolean) => {
    if (!sawImage) fail(`delegated an image question to ${route}, which does not declare image input`)
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
