/**
 * Package-owned invariant companion for `@unieai/uad-tool-page-capture`.
 * @module @unieai/uad-tool-page-capture/invariant
 */

import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'

const PACKAGE_NAME = '@unieai/uad-tool-page-capture'

/** Cordis companion plugin name. */
export const name = 'tool-page-capture-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Every capture the tool hands back is a REFERENCE the store actually holds.
 *
 * The picture leaves this package as an attachment id, and the block beside it
 * claims dimensions and a byte count. If those disagreed with the stored image,
 * a model would reason about a picture nobody has — coordinates off a width
 * that was never encoded. Checked where the tool publishes, because that is the
 * moment the two can diverge.
 */
const install: InvariantInstaller = (ctx: Context, fail) => {
  ctx.on('tool-page-capture/captured', (attachmentId: string, width: number, height: number, bytes: number) => {
    if (attachmentId === '') fail('published a capture with no attachment id')
    if (width <= 0 || height <= 0) fail(`published a capture sized ${String(width)}x${String(height)}`)
    if (bytes <= 0) fail(`published a capture of ${String(bytes)} bytes`)
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
