/**
 * Package-owned invariant companion for `@unieai/uad-browser-operator`.
 * @module @unieai/uad-browser-operator/invariant
 */

import type { Context } from '@unieai/cordis'
import type { InvariantInstaller } from '@unieai/uad-invariants'
import type { OperatorBrowserId, OperatorBrowserView } from './types.ts'

const PACKAGE_NAME = '@unieai/uad-browser-operator'

/** Cordis companion plugin name. */
export const name = 'browser-operator-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * A closed browser stays closed, and ids are unique.
 *
 * The panel reads the published list: a browser that came back live would have
 * its input forwarded to a process that is gone, and two rows sharing an id
 * would render one page into another's tab. Checking it where the list is
 * published names the registry at the moment it happens, rather than leaving a
 * rendering fault to be diagnosed later.
 */
const install: InvariantInstaller = (ctx: Context, fail) => {
  const closed = new Set<OperatorBrowserId>()
  ctx.on('operator-browser/changed', (browsers: OperatorBrowserView[]) => {
    const seen = new Set<OperatorBrowserId>()
    for (const browser of browsers) {
      if (seen.has(browser.browserId)) fail(`published two operator browsers with id ${browser.browserId}`)
      seen.add(browser.browserId)
      if (browser.live && closed.has(browser.browserId)) {
        fail(`operator browser ${browser.browserId} became live again after it closed`)
      }
      if (!browser.live) closed.add(browser.browserId)
    }
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
