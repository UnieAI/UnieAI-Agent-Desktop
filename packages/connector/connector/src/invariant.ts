/**
 * Package-owned invariant companion for `@unieai/uad-connector`.
 * @module @unieai/uad-connector/invariant
 */

import type { Context } from '@unieai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@unieai/uad-invariants'
import { CONNECTOR_SCOPE, grantOf } from './index.ts'
import { credentialKeyId, credentialKeyScope } from '@unieai/uad-credentials'

const PACKAGE_NAME = '@unieai/uad-connector'

/** Cordis companion plugin name. */
export const name = 'connector-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Install the filing contract: a record under the connector scope holds a
 * grant for the connector it is filed as, and nothing else.
 *
 * A grant naming another provider is the one failure in this package that is
 * both silent and serious — `token()` would hand one service's bearer token to
 * a caller reaching for another's, and the request would simply be refused far
 * away from the mistake. `grantOf` already refuses such a record on read, so
 * this watches the write: a record that lands misfiled means whoever wrote it
 * built the payload for one provider and the key for another.
 */
const install: InvariantInstaller = (ctx: Context, fail: InvariantFailure) => {
  ctx.on('credentials/record-updated', (key) => {
    if (credentialKeyScope(key) !== CONNECTOR_SCOPE) return
    const id = credentialKeyId(key)
    void (async () => {
      const record = await ctx.credentials.readRecord(key)
      // A deletion leaves nothing to check, and a record this package did not
      // write is not this package's to judge.
      if (record === undefined || record.kind !== 'grant') return
      if (grantOf(record, id) === undefined) {
        fail(`connector grant filed as "${id}" does not name that provider, so its token would be handed to the wrong service`)
      }
    })()
  })
}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
