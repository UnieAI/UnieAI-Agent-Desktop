/**
 * @unieai/uad-mcp-servers — mounts the MCP servers a person added themselves.
 *
 * WHY THIS EXISTS. `mcp-client` can already connect to any MCP server, and the
 * profile's patch layer can already declare one. What was missing is the act
 * being available to a person who is not editing YAML: connecting a server
 * meant opening `cordis.patch.yml`, knowing the plugin's config shape, and
 * restarting. This keeps the same list in the settings document instead, and
 * mounts it live.
 *
 * IT IS NOT THE ACCOUNT'S LIST. `unieai-mcp-supervisor` mounts what the UnieAI
 * product says this account has connected, with a bearer the product mints and
 * the browser never sees. This one mounts what the person typed on this
 * machine, with a token they typed. The two are deliberately separate services
 * over the same `mcp-client`: one is account state that arrives and expires,
 * the other is local configuration that changes only when someone changes it,
 * and merging them would make an account outage look like a lost setting.
 *
 * RECONCILE, DO NOT RESTART. A settings write remounts only the servers whose
 * name, URL or token moved. Rebuilding the whole set on every keystroke of an
 * unrelated row would drop live connections — and every tool they publish —
 * for the duration.
 */

import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import * as McpClient from '@unieai/uad-mcp-client'
// Type-only: the optional settings service's Context merge.
import type {} from '@unieai/uad-settings'
import { settingsNamespace } from '@unieai/uad-settings'
import {
  MCP_SERVERS_NAMESPACE, McpServersSettings, differs, mountable,
  type McpServerEntry, type McpServersSettingsValue,
} from './settings.ts'

export {
  MCP_SERVERS_FIELD, MCP_SERVERS_NAMESPACE, McpServersSettings, SERVER_NAME_PATTERN,
  differs, mountable, problemsWith,
  type EntryProblem, type McpServerEntry, type McpServersSettingsValue,
} from './settings.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-servers'

/** Deployment configuration. */
export interface Config {
  /**
   * Per-tool-call timeout handed to every mounted server.
   *
   * One value for the whole list rather than one per row: a person adding a
   * server is answering "where is it", and a timeout is a deployment's
   * judgement about its own machine, not part of the address.
   */
  toolCallTimeoutMs: number
}

/** Config schema; the Loader resolves the default. */
export const Config: z<Config> = z.object({
  toolCallTimeoutMs: z.natural().min(1).default(60_000),
})

/** The namespace this plugin's list lives under. */
const NAMESPACE = settingsNamespace(MCP_SERVERS_NAMESPACE)

/** One server this plugin currently holds open. */
interface Mounted {
  entry: McpServerEntry
  dispose: () => Promise<void>
}

/**
 * Register the durable list and keep the mounted set equal to it.
 * @param ctx - host context that may acquire the settings service.
 * @param config - see {@link Config}.
 */
export function apply(ctx: Context, config?: Config): void {
  const toolCallTimeoutMs = config?.toolCallTimeoutMs ?? 60_000
  const settings = ctx.get('settings')
  // No settings provider means no durable list and nothing to mount. That is a
  // composition without user-configurable servers, not a fault: the account's
  // own servers still arrive through their own supervisor.
  if (settings === undefined) return

  // `register` hands back the namespace's own handle; the list is read and
  // observed through it rather than through the service.
  const scope = settings.register(NAMESPACE, McpServersSettings)

  const mounted = new Map<string, Mounted>()

  const unmount = async (mountName: string): Promise<void> => {
    const held = mounted.get(mountName)
    if (held === undefined) return
    mounted.delete(mountName)
    try {
      await held.dispose()
    } catch (error) {
      ctx.logger.warn(`mcp-servers: releasing "${mountName}" failed`)
      ctx.logger.warn(error)
    }
  }

  const mount = async (entry: McpServerEntry): Promise<void> => {
    const fiber = ctx.plugin(McpClient, {
      transport: 'streamable-http',
      serverName: entry.name,
      url: entry.url,
      // A blank token means the server needs none; sending `Bearer ` would be
      // a malformed credential rather than the absence of one.
      headers: entry.token.trim() === '' ? {} : { authorization: `Bearer ${entry.token.trim()}` },
      toolCallTimeoutMs,
      // One unreachable server must not take the others down, and mcp-client's
      // own reconnect loop is the right owner of a transient outage.
      failOnStartupError: false,
    })
    mounted.set(entry.name, { entry, dispose: async () => { await fiber.dispose() } })
    try {
      await fiber.await()
    } catch (error) {
      // The instance rejected its own activation; Cordis has already rolled the
      // fiber back, so the entry would name a server that is not there.
      mounted.delete(entry.name)
      ctx.logger.error(`mcp-servers: mounting "${entry.name}" failed`)
      ctx.logger.error(error)
    }
  }

  /** Bring the mounted set in line with the stored list. */
  const reconcile = async (): Promise<void> => {
    const wanted = mountable((scope.get() as McpServersSettingsValue).servers)
    const wantedByName = new Map(wanted.map(entry => [entry.name, entry]))

    for (const [mountName, held] of [...mounted]) {
      const next = wantedByName.get(mountName)
      // Gone, or changed in a way the transport cannot be told about.
      if (next === undefined || differs([held.entry], [next])) await unmount(mountName)
    }
    for (const entry of wanted) {
      if (!mounted.has(entry.name)) await mount(entry)
    }
  }

  // Writes are serialised: two settings changes in flight would otherwise
  // interleave a mount and an unmount of the same name.
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (): Promise<void> => {
    queue = queue.then(reconcile, reconcile).catch((error: unknown) => {
      ctx.logger.error('mcp-servers: reconciling the list failed')
      ctx.logger.error(error)
    })
    return queue
  }

  ctx.effect(() => scope.watch(() => { void enqueue() }), 'mcp-servers: list watch')
  void enqueue()

  ctx.effect(() => () => {
    void (async () => {
      for (const mountName of [...mounted.keys()]) await unmount(mountName)
    })()
  }, 'mcp-servers: mounted servers')
}
