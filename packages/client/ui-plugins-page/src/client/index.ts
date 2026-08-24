/**
 * Plugins plugin, browser half: the main-area surface behind the sidebar's
 * Plugins row, the row itself, and the UnieAI Studio entry, plugin directory,
 * Studio MCP and skills areas on it.
 *
 * WHERE IT SITS. `shell.overlay` is the only additive root seat the frame
 * documents, and it spans the whole app box; the surface offsets its left
 * edge by ui-layout's `--dsh-shell-sidebar-width` so the navigation column
 * stays visible and its Plugins row stays the marked one. A destination
 * reached from the sidebar has to leave the sidebar standing.
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
import { SkillsArea, type SkillsAreaInjected } from './SkillsArea.tsx'
import { StudioMcpArea, type StudioMcpAreaInjected } from './StudioMcpArea.tsx'
import { StudioEntry, type StudioEntryInjected } from './StudioEntry.tsx'
import { StudioMcpSource } from './studio-mcp-source.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type {
  PluginsNavRowComponentProps, PluginsNavRowInjected, PluginsPageAreaOwnerProps,
  PluginsPageComponentProps, PluginsPageInjected,
} from './contract/slots.ts'
export type { SkillsAreaComponentProps, SkillsAreaInjected } from './SkillsArea.tsx'
export type { StudioMcpAreaComponentProps, StudioMcpAreaInjected } from './StudioMcpArea.tsx'
export type { StudioEntryComponentProps, StudioEntryInjected } from './StudioEntry.tsx'
export type { StudioBinding } from './studio-entry.ts'
export {
  STUDIO_BINDING_URL, STUDIO_ICON, STUDIO_MCP_SERVER_ID, readStudioBinding,
} from './studio-entry.ts'
export type { PluginsPageState } from './page-store.ts'
export type { PluginsViewId } from './PluginsPage.tsx'
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
 * Overlay position of the surface. High, because it is a destination and
 * covers the frame's main area — a badge or a toast registered later still
 * paints over it.
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

  // The page is an overlay over the shell, and the sidebar keeps working
  // underneath it: New chat and every session row take the reader back to the
  // conversation while this surface stays up. Closing here is what makes the
  // sidebar mean what it says.
  //
  // The signal is the sidebar's ACT, not the session state it produces:
  // pressing New chat while a blank session is already current changes no
  // observable state at all, so a listener on the session store would never
  // fire for exactly the case that traps someone.
  ctx.effect(
    () => ctx.on('sidebar/navigate', () => {
      if (page.store.getSnapshot().open) page.close()
    }),
    'ui-plugins-page: close when the sidebar navigates',
  )
  const servers = new StudioMcpSource({ request: (path, init) => globalThis.fetch(path, init) })
  ctx.effect(() => () => { servers.dispose() }, 'ui-plugins-page: studio mcp source')

  const directory = new DirectorySource({ request: (path, init) => globalThis.fetch(path, init) })
  ctx.effect(() => () => { directory.dispose() }, 'ui-plugins-page: plugin directory source')

  /** Re-read every source this package owns. */
  const readAll = (): void => {
    void servers.refresh()
    void directory.refresh()
  }

  // The surface declares the one hole everything on it arrives through. Its
  // own apply registers the plugin directory, the Studio MCP area and the
  // skills area below; ui-settings-plugin-inventory registers the Loader
  // inventory and ui-settings-plugins the cordis registry. The surface
  // imports none of them.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'plugins-page',
    order: OVERLAY_ORDER,
    locale: NS,
    children: { 'plugins.page.area': { kind: 'list', scope: 'root' } },
    inject: (): PluginsPageInjected => ({
      hooks: { page: page.store },
      close: () => { page.close() },
      refresh: readAll,
    }),
  }, PluginsPage))

  // The lists are read when the surface is opened rather than at boot: they
  // belong to an account that can change them elsewhere, and a desktop that
  // asked at startup would show a stale answer for the rest of the document's
  // life. Leaving reads nothing: the next arrival is what re-asks.
  ctx.slots.inject('sidebar.nav.action', () => ctx.slots.register({
    name: 'sidebar.nav.action',
    id: 'plugins-page',
    order: NAV_ORDER,
    locale: NS,
    inject: (): PluginsNavRowInjected => ({
      hooks: { page: page.store },
      toggle: () => {
        if (page.store.getSnapshot().open) {
          page.close()
          return
        }
        page.open()
        readAll()
      },
    }),
  }, PluginsNavRow))

  // The one entry on this surface whose EXISTENCE is fixed rather than read.
  // It stands above the catalogue on the same destination because it is this
  // product's own integration and the catalogue is everyone else's; everything
  // it displays still comes from the `servers` source below it, which is why
  // it binds that source rather than a second reader (studio-entry.ts).
  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    id: 'unieai-studio',
    order: -20,
    locale: NS,
    inject: (): StudioEntryInjected => ({
      hooks: { servers },
      refresh: () => { void servers.refresh() },
    }),
  }, StudioEntry))

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

  // The skills destination's only occupant. It reads nothing, because nothing
  // root-scoped reports skills (SkillsArea's module doc names the route and
  // why it cannot answer here); the entry exists so the destination has a
  // body and so a build that gains a catalogue replaces this id instead of
  // editing the surface.
  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    id: 'skills',
    order: 0,
    locale: NS,
    inject: (): SkillsAreaInjected => ({}),
  }, SkillsArea))
}
