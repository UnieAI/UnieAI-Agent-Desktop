/**
 * The Plugins surface's slot contract: the root seat this package occupies,
 * and the one hole it declares inside it.
 *
 * The surface is a `shell.overlay` occupant rather than a settings section,
 * because Plugins is a destination in this product and not a preference: the
 * sidebar's Plugins row opens a place, the way the reference web product opens
 * `/customize/plugins`. `shell.overlay` is the only additive root seat the
 * frame documents, so the surface sits beside the shipped overlay entries
 * rather than shadowing the frame.
 *
 * It occupies the MAIN AREA of that layer, not the whole of it: the surface
 * offsets its left edge by `--dsh-shell-sidebar-width` (ui-layout's
 * `SIDEBAR_WIDTH_PROPERTY`), so the navigation column stays visible and its
 * Plugins row stays the marked one while the reader is here.
 *
 * Everything the surface shows arrives through `plugins.page.area`. The
 * surface itself owns only its chrome (destination strip, title, the controls
 * that act on the whole of it, scroll column) and the open state behind it; it
 * knows nothing about MCP servers or about cordis plugins, and adding a fourth
 * area to it is a registration, not an edit.
 */
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@unieai/uad-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry) into
// every program that sees this contract, so PropsRuntime resolves.
import type {} from '@unieai/uad-client-ui-layout/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.nav.action' seat).
import type {} from '@unieai/uad-client-ui-sidebar/client'
import type { PluginsPageKey } from '../locales.ts'
import type { PluginsPageState } from '../page-store.ts'

declare module '@unieai/uad-client-ui-slots' {
  interface SlotMap {
    /**
     * One area on the Plugins surface, stacked in `order` within whichever
     * destination lists its id. Declared by this package's `shell.overlay`
     * entry (declaring is claiming); this package registers the plugin
     * directory, the Studio MCP area and the skills area,
     * `ui-settings-plugin-inventory` registers the read-only Loader
     * inventory, and `ui-settings-plugins` registers the cordis plugin
     * registry it used to register as a settings section.
     *
     * The owner supplies nothing at all: an area draws its own heading,
     * its own intro, and its own body, because the surface has no opinion
     * about what an area is. It is deliberately the same shape as
     * `settings.section` in that respect, so a surface can move between the
     * two without its component learning anything new.
     */
    'plugins.page.area': { kind: 'list'; scope: 'root'; owner: PluginsPageAreaOwnerProps }
  }
  interface LocaleNamespaceMap {
    /** Plugins surface chrome, directory, skills and Studio MCP area copy. */
    'plugins': PluginsPageKey
  }
}

/** Owner share of a surface area (the surface supplies nothing). */
export interface PluginsPageAreaOwnerProps {
  /** Marker field: area owner props are intentionally empty. */
  children?: never
}

/**
 * Registrant-private injected share of the page: the open state it renders
 * and the one gesture its chrome performs. Open state lives in an apply-level
 * controller rather than a declared store because the sidebar nav row writes
 * it too, and a declared store belongs to the render machinery.
 */
export interface PluginsPageInjected {
  hooks: {
    /** Whether the surface is open. */
    page: import('@unieai/uad-client-ui-slots').HostObservable<PluginsPageState>
  }
  /** Close the surface and return to whatever the main area was showing. */
  close: () => void
  /**
   * Re-read every source this package owns.
   *
   * The chrome carries the gesture because it acts on the whole surface, not
   * on one area: an area that also draws its own retry keeps it, since a
   * failed read is that area's state and not the surface's.
   */
  refresh: () => void
}

/** Registrant-private injected share of the sidebar's Plugins nav row. */
export interface PluginsNavRowInjected {
  hooks: {
    /** The same open state the surface reads, so the row can mark itself current. */
    page: import('@unieai/uad-client-ui-slots').HostObservable<PluginsPageState>
  }
  /**
   * Open the surface, or leave it when it is already the current place.
   *
   * A destination row toggles because the surface covers the conversation the
   * reader came from: the row is where they are, so pressing it again is the
   * gesture that puts them back.
   */
  toggle: () => void
}

/** Full component props of the surface. */
export type PluginsPageComponentProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'plugins.page.area'>
  & InjectFace<PluginsPageInjected>
  & PropsLocale<'plugins'>

/** Full component props of the sidebar's Plugins nav row. */
export type PluginsNavRowComponentProps =
  PropsRuntime<'sidebar.nav.action'>
  & InjectFace<PluginsNavRowInjected>
  & PropsLocale<'plugins'>
