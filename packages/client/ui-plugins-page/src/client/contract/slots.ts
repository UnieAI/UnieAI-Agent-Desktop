/**
 * The Plugins page's slot contract: the frame-wide page seat this package
 * occupies, and the one hole it declares inside it.
 *
 * The page is a `shell.overlay` occupant rather than a settings section,
 * because Plugins is a destination in this product and not a preference: the
 * sidebar's Plugins row opens a page, the way the reference web product opens
 * `/customize/plugins`. `shell.overlay` is the seat the shell documents for
 * "a surface of your own that floats over the whole app" — it is additive, so
 * the page sits beside the shipped overlay entries rather than shadowing the
 * frame.
 *
 * Everything the page shows arrives through `plugins.page.area`. The page
 * itself owns only its chrome (title, close control, scroll column) and the
 * open state behind it; it knows nothing about MCP servers or about cordis
 * plugins, and adding a third area to it is a registration, not an edit.
 */
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry) into
// every program that sees this contract, so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.nav.action' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PluginsPageKey } from '../locales.ts'
import type { PluginsPageState } from '../page-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One area stacked down the Plugins page, in `order`. Declared by this
     * package's `shell.overlay` entry (declaring is claiming); this package
     * registers the Studio MCP area, `ui-settings-plugin-inventory` registers
     * the read-only plugin directory, and `ui-settings-plugins` registers the
     * cordis plugin registry it used to register as a settings section.
     *
     * The owner supplies nothing at all: an area draws its own heading,
     * its own intro, and its own body, because the page has no opinion about
     * what an area is. It is deliberately the same shape as
     * `settings.section` in that respect, so a surface can move between the
     * two without its component learning anything new.
     */
    'plugins.page.area': { kind: 'list'; scope: 'root'; owner: PluginsPageAreaOwnerProps }
  }
  interface LocaleNamespaceMap {
    /** Plugins page chrome and Studio MCP area copy. */
    'plugins': PluginsPageKey
  }
}

/** Owner share of a page area (the page supplies nothing). */
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
    /** Whether the page is open. */
    page: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<PluginsPageState>
  }
  /** Close the page and return to whatever the frame was showing. */
  close: () => void

}

/** Registrant-private injected share of the sidebar's Plugins nav row. */
export interface PluginsNavRowInjected {
  hooks: {
    /** The same open state the page reads, so the row can mark itself current. */
    page: import('@deepseek-ai/dsh-client-ui-slots').HostObservable<PluginsPageState>
  }
  /** Open the page. */
  open: () => void
}

/** Full component props of the page surface. */
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
