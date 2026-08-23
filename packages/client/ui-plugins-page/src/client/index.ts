/**
 * Plugins page plugin, browser half: the standalone page behind the sidebar's
 * Plugins row, the row itself, and the Studio MCP area on the page.
 *
 * WHY A PAGE. The word "plugin" meant two different things in this product.
 * The reference web product's Plugins page is where an account's MCP servers
 * and bundles live — a destination people go to. This desktop's Plugins was
 * the cordis registry behind a settings section: real, useful, and
 * developer-facing. The sidebar row promised the first and opened the second.
 * Both are areas on this page now, and neither owns the word alone.
 *
 * WHAT THIS PACKAGE OWNS. The page chrome, its open state, the nav row that
 * opens it, and the `plugins.page.area` hole. The cordis registry is still
 * `ui-settings-plugins`' — that package registers the same section component
 * into the hole below, with its tabs and its cards untouched; nothing was
 * copied out of it. The read-only plugin directory between them is
 * `ui-settings-plugin-inventory`', registered the same way.
 *
 * THE OLD ROW DISAPPEARS BY ITSELF. `ui-settings-general` draws a Plugins nav
 * row that opens the settings panel, and hides it whenever no `plugins`
 * settings section is registered. Moving the cordis section onto this page is
 * exactly that condition, so the two rows never appear together and the
 * settings shell needed no edit.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' seat) and
// ui-sidebar's (the 'sidebar.nav.action' seat). Cross-plugin collaboration
// goes through slots and services, never a value import (client bundle purity
// gate).
import type {} from '@unieai/uad-client-ui-layout/client'
import type {} from '@unieai/uad-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import type { PluginsNavRowInjected, PluginsPageInjected } from './contract/slots.ts'
import { PluginsPage } from './PluginsPage.tsx'
import { PluginsNavRow } from './PluginsNavRow.tsx'
import { PluginsPageController } from './page-store.ts'
import { DirectoryArea, type DirectoryAreaInjected } from './DirectoryArea.tsx'
import { DirectorySource } from './directory-source.ts'
import { StudioMcpArea, type StudioMcpAreaInjected } from './StudioMcpArea.tsx'
import { StudioMcpSource } from './studio-mcp-source.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type {
  PluginsNavRowComponentProps, PluginsNavRowInjected, PluginsPageAreaOwnerProps,
  PluginsPageComponentProps, PluginsPageInjected,
} from './contract/slots.ts'
export type { StudioMcpAreaComponentProps, StudioMcpAreaInjected } from './StudioMcpArea.tsx'
export type { PluginsPageState } from './page-store.ts'
export { PluginsPageController } from './page-store.ts'
export type {
  StudioMcpEnvironment, StudioMcpRow, StudioMcpState, StudioMcpTool,
} from './studio-mcp-source.ts'
export { StudioMcpSource } from './studio-mcp-source.ts'
export type { DirectoryAreaComponentProps, DirectoryAreaInjected } from './DirectoryArea.tsx'
export type {
  DirectoryFailure, DirectoryOutcome, DirectoryRow, DirectoryState,
} from './directory-source.ts'
export { DirectorySource } from './directory-source.ts'
export type { PluginsPageKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'plugins'

/**
 * Sidebar position of the Plugins row: the seat the settings shell's row held,
 * so the column reads the same as before the page existed.
 */
const NAV_ORDER = 10

/**
 * Overlay position of the page. High, because the page is a destination and
 * covers the frame — a badge or a toast registered later still paints over it.
 */
const OVERLAY_ORDER = 100

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * other packages' applies, whose activation order relative to this one is NOT
 * constrained; registrations depend on their slots through `slots.inject()`.
 */
export const inject = ['slots', 'locale']

/**
 * Register the page, the sidebar row that opens it, the Studio MCP area, and
 * the dictionaries all three read.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-plugins-page: copy dictionaries',
  )

  const page = new PluginsPageController()
  const servers = new StudioMcpSource({ request: (path, init) => globalThis.fetch(path, init) })
  ctx.effect(() => () => { servers.dispose() }, 'ui-plugins-page: studio mcp source')

  const directory = new DirectorySource({ request: (path, init) => globalThis.fetch(path, init) })
  ctx.effect(() => () => { directory.dispose() }, 'ui-plugins-page: plugin directory source')

  // The page declares the one hole everything on it arrives through. Its own
  // apply registers the Studio MCP area below; ui-settings-plugin-inventory
  // registers the plugin directory and ui-settings-plugins the cordis
  // registry. The page imports none of them.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'plugins-page',
    order: OVERLAY_ORDER,
    locale: NS,
    children: { 'plugins.page.area': { kind: 'list', scope: 'root' } },
    inject: (): PluginsPageInjected => ({
      hooks: { page: page.store },
      close: () => { page.close() },
    }),
  }, PluginsPage))

  // The list is read when the page is opened rather than at boot: it belongs
  // to an account that can change it elsewhere, and a desktop that asked at
  // startup would show a stale answer for the rest of the document's life.
  ctx.slots.inject('sidebar.nav.action', () => ctx.slots.register({
    name: 'sidebar.nav.action',
    id: 'plugins-page',
    order: NAV_ORDER,
    locale: NS,
    inject: (): PluginsNavRowInjected => ({
      hooks: { page: page.store },
      open: () => {
        page.open()
        void servers.refresh()
        void directory.refresh()
      },
    }),
  }, PluginsNavRow))

  // Order below the MCP area: the directory is what a reader came to the page
  // for, and what they already have connected is context for it.
  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    // Not `plugin-directory`: ui-settings-plugin-inventory already holds that
    // id for the cordis registry it lists, and two entries with one id in a
    // list slot refuse to load rather than shadowing each other.
    id: 'unieai-directory',
    order: -10,
    locale: NS,
    inject: (): DirectoryAreaInjected => ({
      hooks: { directory },
      refresh: () => { void directory.refresh() },
      install: slug => directory.install(slug).then(() => undefined),
      remove: slug => directory.remove(slug).then(() => undefined),
    }),
  }, DirectoryArea))

  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    id: 'studio-mcp',
    order: 0,
    locale: NS,
    inject: (): StudioMcpAreaInjected => ({
      hooks: { servers },
      refresh: () => { void servers.refresh() },
    }),
  }, StudioMcpArea))
}
