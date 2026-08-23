/**
 * The mount registry: which MCP servers this host currently holds open on the
 * signed-in account's behalf, and the grant each was mounted with.
 *
 * It is a separate module from the plugin so the reconciliation decision — mount,
 * leave alone, re-mount, drop — can be stated and tested without a Cordis tree,
 * and so disposal has one owner rather than being spread across the callbacks
 * that create fibers.
 *
 * @module dsh-unieai-mcp-supervisor/registry
 */

import type { McpServerGrant } from '@deepseek-ai/dsh-unieai-web-gate'

/** One live mcp-client instance and the grant it was mounted with. */
export interface MountedServer {
  /** The grant's id, which is also the mounted instance's tool namespace. */
  id: string
  /** Endpoint the instance dials. */
  url: string
  /** Bearer the instance sends. Host-side only. */
  token: string
  /** ISO timestamp at which {@link token} stops working. */
  expiresAt: string
  /** Release this instance: disconnect, unregister its tools, free the namespace. */
  dispose: () => Promise<void>
}

/**
 * Whether a mounted instance still matches the grant the product now reports.
 *
 * The token is part of the comparison, which means a re-read that minted a
 * fresh one re-mounts even though nothing else changed. That is deliberate:
 * `mcp-client` captures its headers at construction and has no seam for
 * replacing them, so the only way to move a new bearer onto a connection is a
 * new connection. Leaving the old one up would keep a server that works right
 * up until its grant lapses and then fails every call with no other signal.
 * @param mounted - the instance this host holds.
 * @param grant - the grant the product just reported.
 * @returns true when the mounted instance is still the right one.
 */
export function matchesGrant(mounted: MountedServer, grant: McpServerGrant): boolean {
  return mounted.url === grant.url
    && mounted.token === grant.token
    && mounted.expiresAt === grant.expiresAt
}

/**
 * When the next read should happen, given the grants currently held.
 *
 * The earliest expiry decides it, minus a skew, because one lapsed grant is
 * enough to make a mounted server fail silently. An unreadable or already-past
 * expiry collapses to the floor rather than to "never": a product build that
 * reported no timestamp still handed out a token that stops working, and the
 * only safe reading of an unknown lifetime is a short one.
 * @param grants - the grants just read; empty means nothing is mounted.
 * @param now - current epoch milliseconds.
 * @param bounds - the skew ahead of expiry, and the floor and ceiling on the wait.
 * @returns the delay in milliseconds until the next read.
 */
export function nextRefreshDelay(
  grants: readonly McpServerGrant[],
  now: number,
  bounds: { skewMs: number; minMs: number; maxMs: number },
): number {
  let earliest = Number.POSITIVE_INFINITY
  for (const grant of grants) {
    const at = Date.parse(grant.expiresAt)
    // NaN for a timestamp this build cannot read, which must not win the
    // comparison and must not be treated as a distant expiry either — the
    // floor below is what covers it.
    if (Number.isNaN(at)) return bounds.minMs
    if (at < earliest) earliest = at
  }
  // No grants at all: nothing can lapse, so the next read is only about
  // noticing a server the account connected in the meantime.
  if (earliest === Number.POSITIVE_INFINITY) return bounds.maxMs
  const delay = earliest - bounds.skewMs - now
  if (delay < bounds.minMs) return bounds.minMs
  return delay > bounds.maxMs ? bounds.maxMs : delay
}
