/**
 * The plugin directory, browser half: one area on the Plugins page listing
 * every plugin the Cordis Loader reports for this build.
 *
 * WHY THE PAGE AND NOT THE SETTINGS PANEL. This used to be the `all` tab
 * inside `ui-settings-plugins`' section, and that section has since become an
 * area on the standalone Plugins page. Two things follow. First, there is no
 * `plugins` settings section any more — `ui-settings-general` hides its
 * Plugins nav row exactly when none exists — so putting the directory back
 * into the panel would resurrect a second Plugins destination, which is the
 * thing the page was created to end. Second, a directory is what the page IS:
 * behind a tab in a developer-facing configuration section it is a subsection
 * of a subsection, and its chrome (the tab strip, the heading above it)
 * belongs to another package.
 *
 * So it registers into `plugins.page.area`, the seat the page documents for a
 * surface of its own, at `order` 5: after the account's Studio MCP servers
 * and before the cordis configuration cards. Account, then build, then the
 * developer's knobs.
 *
 * The Remote is read lazily, when the page first mounts the area — the
 * inventory belongs to a Loader that can change under a long-lived document,
 * and a read at boot would show a stale answer for the rest of the session.
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.page.area'
// seat). Cross-plugin collaboration goes through slots and services, never a
// value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-plugins-page/client'
import { PluginDirectoryArea, type PluginDirectoryAreaInjected } from './PluginDirectoryArea.tsx'
import { en, ja, zh, zhTW, type PluginInventoryLocaleKey } from './locales.ts'

export type { PluginDirectoryAreaInjected, PluginDirectoryAreaProps } from './PluginDirectoryArea.tsx'
export type { PluginInventoryLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Read-only Host plugin directory copy. */
    'settings.pluginInventory': PluginInventoryLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'

/** Services required by the page registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory']

/**
 * Position on the Plugins page: between the account's Studio MCP area
 * (`order` 0) and the cordis configuration registry (`order` 10).
 */
const AREA_ORDER = 5

/**
 * Contribute the plugin directory to the Plugins page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-settings-plugin-inventory: dictionaries',
  )

  const list: PluginDirectoryAreaInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginDirectoryAreaInjected => ({ list })

  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    id: 'plugin-directory',
    order: AREA_ORDER,
    locale: NS,
    inject: injected,
  }, PluginDirectoryArea))
}
