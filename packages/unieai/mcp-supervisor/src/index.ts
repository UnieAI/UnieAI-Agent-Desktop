/**
 * @deepseek-ai/dsh-unieai-mcp-supervisor — mounts the MCP servers the
 * signed-in UnieAI account grants, and keeps them mounted.
 *
 * The web product hosts MCP servers on its users' behalf and hands a desktop a
 * per-user bearer for each one (`/api/desktop/mcp`). `mcp-client` can dial
 * exactly such a server, but it is configured from `cordis.yml` and a
 * composition file cannot know which servers an account has connected — or
 * hold a credential that is minted per sign-in. This plugin is the piece
 * between them: it reads the grants through the sign-in gate and mounts one
 * `mcp-client` instance per server at runtime.
 *
 * ```yaml
 * - id: unieai-mcp-supervisor
 *   name: '@deepseek-ai/dsh-unieai-mcp-supervisor'
 * ```
 *
 * **The grants expire, and that is the hard part.** Each bearer is good for
 * about an hour, and a mounted server whose bearer lapsed fails every call
 * with nothing else to say why — no disconnect, no reconnect, just refusals.
 * So the supervisor does not wait to be told: it re-reads the list ahead of
 * the earliest expiry it holds and re-mounts anything whose grant changed. A
 * re-mint always changes the bearer, and `mcp-client` captures its headers at
 * construction, so a refresh cycle is a disconnect and a reconnect by
 * construction. The alternative — leaving a connection up with a dead bearer —
 * is a server that is silently broken rather than briefly absent.
 *
 * Signing out drops every instance, because the grants were the account's.
 *
 * @module @deepseek-ai/dsh-unieai-mcp-supervisor
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
// Side-effect type import: pulls the `unieaiGate` service and the
// `unieai-gate/session` event declaration onto Context.
import type {} from '@deepseek-ai/dsh-unieai-web-gate'
import type { McpServerGrant } from '@deepseek-ai/dsh-unieai-web-gate'
import { matchesGrant, nextRefreshDelay } from './registry.ts'
import type { MountedServer } from './registry.ts'

export { matchesGrant, nextRefreshDelay } from './registry.ts'
export type { MountedServer } from './registry.ts'

/** Plugin name for the Loader. */
export const name = 'unieai-mcp-supervisor'
/** Required service: the sign-in gate that holds the account and its grants. */
export const inject = ['unieaiGate']

/**
 * The tool namespace `mcp-client` accepts. Restated here because a grant id is
 * the product's identifier, not a name chosen for this purpose: one that
 * cannot be a namespace has to be reported as a server this desktop skipped,
 * not handed to a plugin that will fail its own load over it.
 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Deployment configuration. */
export interface Config {
  /**
   * How long before a grant expires the list is re-read. The margin has to
   * cover the read, the disconnect, and the reconnect — everything that
   * happens between noticing an expiry and having a working connection again.
   */
  refreshSkewMs: number
  /**
   * Floor on the wait between two reads. It also covers the cases with no
   * usable deadline at all: a grant whose expiry this build cannot parse, and
   * one that is already past.
   */
  minRefreshMs: number
  /**
   * Ceiling on the wait. It is what paces the read when nothing is mounted,
   * which is how a server the account connects while signed in is noticed
   * without a signal from the product.
   */
  maxRefreshMs: number
  /**
   * Wait before trying again after a read failed. Separate from
   * {@link minRefreshMs} because a failed read says nothing about when the
   * grants lapse: whatever is mounted keeps working until it does, and
   * hammering a product that is down does not bring the next list any sooner.
   */
  retryDelayMs: number
  /** Per-tool-call timeout handed to every mounted instance. */
  toolCallTimeoutMs: number
}

/** Schema for {@link Config}. */
export const Config: z<Config> = z.object({
  refreshSkewMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(5 * 60 * 1000),
  minRefreshMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(30 * 1000),
  maxRefreshMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(30 * 60 * 1000),
  retryDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(60 * 1000),
  toolCallTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(60 * 1000),
})

/**
 * Mount and supervise the account's MCP servers.
 * @param ctx - Cordis context carrying `unieaiGate`.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  /** Live instances by grant id. This is the registry disposal must empty. */
  const mounted = new Map<string, MountedServer>()
  let timer: ReturnType<typeof setTimeout> | undefined
  /**
   * The reconciliations run one at a time. Two overlapping passes would both
   * see the same stale registry and mount the same namespace twice, which
   * `mcp-client` refuses at load — so the second pass would fail on a server
   * the first had already brought up correctly.
   */
  let queue: Promise<void> = Promise.resolve()
  let disposed = false
  /**
   * Read through a call rather than the binding: the checks below straddle
   * `await` points, and a narrowed `let` would let one of them be optimized
   * away as always-false — the whole point is that the disposer flipped it
   * while the reconciliation was suspended.
   */
  const isDisposed = (): boolean => disposed

  const clearTimer = (): void => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const schedule = (delayMs: number): void => {
    clearTimer()
    if (isDisposed()) return
    timer = setTimeout(() => {
      timer = undefined
      void enqueue()
    }, delayMs)
    // A pending refresh must not hold the process open: this is background
    // maintenance of something the operator can always re-establish by
    // reloading the page.
    timer.unref()
  }

  /** Release one instance, whatever it was mounted for, and forget it. */
  const unmount = async (id: string): Promise<void> => {
    const server = mounted.get(id)
    if (server === undefined) return
    mounted.delete(id)
    try {
      await server.dispose()
    } catch (error) {
      // A disposal that failed still leaves the entry gone: keeping it would
      // make the next pass believe the server is mounted and skip re-mounting
      // it, which is the failure this plugin exists to prevent.
      ctx.logger.warn(`unieai-mcp-supervisor: releasing MCP server "${id}" failed`)
      ctx.logger.warn(error)
    }
  }

  /** Release every instance. */
  const unmountAll = async (): Promise<void> => {
    await Promise.all([...mounted.keys()].map(id => unmount(id)))
  }

  /**
   * Bring one server up under its grant.
   *
   * The bearer travels as a header on a plugin config, which is the only way
   * `mcp-client` takes one; it never reaches a browser, because the grants are
   * read through the gate's host-side seam rather than through `/auth/mcp`.
   * @param grant - the grant to mount.
   */
  const mount = async (grant: McpServerGrant): Promise<void> => {
    const fiber = ctx.plugin(McpClient, {
      transport: 'streamable-http',
      serverName: grant.id,
      url: grant.url,
      headers: { authorization: `Bearer ${grant.token}` },
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      // One unreachable server must not take the rest of the account's servers
      // down with it, and `mcp-client`'s own reconnect loop is the right owner
      // of a transient outage.
      failOnStartupError: false,
    })
    mounted.set(grant.id, {
      id: grant.id,
      url: grant.url,
      token: grant.token,
      expiresAt: grant.expiresAt,
      dispose: async () => { await fiber.dispose() },
    })
    try {
      await fiber.await()
    } catch (error) {
      // The instance rejected its own activation. Cordis has already rolled
      // the fiber back, so the entry would name a server that is not there.
      mounted.delete(grant.id)
      ctx.logger.error(`unieai-mcp-supervisor: mounting MCP server "${grant.id}" failed`)
      ctx.logger.error(error)
    }
  }

  /**
   * Reconcile the mounted set against what the product now reports, and decide
   * when to do it again.
   *
   * A read that failed leaves the mounted set alone: those instances keep
   * working until their grants lapse, and dropping them because one HTTP call
   * failed would turn a momentary outage into a loss of every tool.
   */
  const reconcile = async (): Promise<void> => {
    if (isDisposed()) return
    if (ctx.unieaiGate.session() === undefined) {
      clearTimer()
      await unmountAll()
      return
    }
    const grants = await ctx.unieaiGate.mcpServers().catch(() => undefined)
    if (isDisposed()) return
    if (grants === undefined) {
      ctx.logger.warn('unieai-mcp-supervisor: the UnieAI MCP server list could not be read; keeping what is mounted')
      schedule(config.retryDelayMs)
      return
    }
    const wanted = new Map<string, McpServerGrant>()
    for (const grant of grants) {
      if (!SERVER_NAME_PATTERN.test(grant.id)) {
        ctx.logger.warn(
          `unieai-mcp-supervisor: skipping MCP server "${grant.id}" — its id cannot be a tool namespace`
          + ` (${String(SERVER_NAME_PATTERN)})`,
        )
        continue
      }
      wanted.set(grant.id, grant)
    }
    // Drop first, in one pass, so a re-mount never contends with the instance
    // it replaces for the same tool namespace.
    for (const id of [...mounted.keys()]) {
      const grant = wanted.get(id)
      const server = mounted.get(id)
      if (grant !== undefined && server !== undefined && matchesGrant(server, grant)) continue
      await unmount(id)
    }
    for (const [id, grant] of wanted) {
      if (mounted.has(id)) continue
      await mount(grant)
    }
    if (isDisposed()) {
      await unmountAll()
      return
    }
    schedule(nextRefreshDelay(grants, Date.now(), {
      skewMs: config.refreshSkewMs,
      minMs: config.minRefreshMs,
      maxMs: config.maxRefreshMs,
    }))
  }

  /** Run one reconciliation after every one already queued. */
  const enqueue = (): Promise<void> => {
    queue = queue.then(reconcile, reconcile).catch((error: unknown) => {
      ctx.logger.error('unieai-mcp-supervisor: reconciling the account\'s MCP servers failed')
      ctx.logger.error(error)
    })
    return queue
  }

  // A session may already exist when this plugin mounts — a reload of the
  // plugin tree does not sign anybody out — so the first pass is not waiting
  // for an event that has already happened.
  ctx.on('unieai-gate/session', () => { void enqueue() })
  void enqueue()

  ctx.effect(() => () => {
    disposed = true
    clearTimer()
    // Chained onto the queue rather than run beside it: a reconciliation in
    // flight is still creating fibers, and tearing down underneath it would
    // leave the ones it creates next with nothing to release them.
    return queue.then(unmountAll)
  }, 'unieai-mcp-supervisor: mounted MCP servers')
}
