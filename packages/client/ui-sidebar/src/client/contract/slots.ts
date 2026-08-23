/**
 * Sidebar slot contract: the registrant-side props composition for the
 * layout-owned `sidebar` slot, plus the holes this shell declares. The shell
 * owns column geometry (fold state machine, brand row, New chat); the nav
 * rows under New chat are `sidebar.nav.action` registrants', everything
 * between the section header and the list bottom is the `sidebar.workspaces`
 * registrant's (ui-workspace), and the foot holds `sidebar.footer.action`
 * above one identity row shared by the `sidebar.account` and
 * `sidebar.settings` registrants.
 */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'sidebar' entry) into every
// program that sees this contract, so PropsRuntime<'sidebar'> resolves.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Brand mark rendered in the expanded brand row and collapsed rail.
     * Declared by this package's `sidebar` entry; deployments may replace
     * the shell's fish fallback without replacing the surrounding controls.
     */
    'sidebar.brand.mark': { kind: 'single'; scope: 'root'; owner: SidebarBrandMarkOwnerProps }
    /**
     * Brand name rendered beside the expanded mark. Declared by this
     * package's `sidebar` entry; the shell supplies a generic text fallback.
     */
    'sidebar.brand.name': { kind: 'single'; scope: 'root'; owner: SidebarBrandNameOwnerProps }
    /**
     * Nav rows under New chat, the way the reference column opens: one
     * ordered list of full-width rows that reach a capability elsewhere in
     * the app. Declared by this package's 'sidebar' entry; each occupant
     * receives only the column state and draws the shell's own row box
     * (248x34 at `7px 10px`, 10px gap, 13/19.5 with the label at 500; the
     * rail's 36px control collapsed). The shell holds no state for them.
     */
    'sidebar.nav.action': { kind: 'list'; scope: 'root'; owner: SidebarNavActionOwnerProps }
    /**
     * The workspace/session browsing region: section header, search, the
     * grouped/flat session list, and every workspace dialog. Declared by this
     * package's 'sidebar' entry (declaring is claiming); ui-workspace
     * registers the browser.
     */
    'sidebar.workspaces': { kind: 'single'; scope: 'root'; owner: SidebarSectionOwnerProps }
    /**
     * The settings seat at the sidebar foot. Declared by this package's
     * 'sidebar' entry; ui-settings registers its trigger row + modal panel.
     * The sidebar passes only its column state — it holds no settings state.
     */
    'sidebar.settings': { kind: 'single'; scope: 'root'; owner: SidebarSettingsOwnerProps }
    /**
     * Optional actions beside Settings at the sidebar foot. Declared by this
     * package's 'sidebar' entry; each action receives only the column state.
     */
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps }
    /**
     * The account row: the column's last row, and the one place the signed-in
     * person appears. Declared by this package's 'sidebar' entry;
     * ui-unieai-account registers the row. The sidebar passes only its column
     * state — it holds no account state and knows of no account gateway.
     */
    'sidebar.account': { kind: 'single'; scope: 'root'; owner: SidebarAccountOwnerProps }
  }
}

/** Geometry supplied to the sidebar brand-mark occupant. */
export interface SidebarBrandMarkOwnerProps {
  /** Requested square edge in pixels. */
  size: number
}

/** Empty owner share for the sidebar brand-name occupant. */
export interface SidebarBrandNameOwnerProps {
  /** Marker field: the occupant owns its own content and width. */
  children?: never
}

/**
 * Owner share of the browser hole — the only facts crossing the shell/region
 * boundary. Business data and actions arrive through the region's own inject.
 */
export interface SidebarSectionOwnerProps {
  /** Shell fold-state output: wide renders the full browser, rail the icon column. */
  wide: boolean
  /** Rail icons request expansion; the browser rides the wide flip for focus. */
  expandSidebar: () => void
  /**
   * Nonce raised whenever the column's Search nav row is pressed. The search
   * field belongs to the region, not to the shell, so the shell asks rather
   * than reaches: every raise means "open your search and take focus". A
   * counter rather than a boolean, because pressing the row twice in a row is
   * two requests and a boolean would swallow the second.
   */
  searchRequest: number
}

/**
 * Owner share of the sidebar settings seat: the column display state the
 * occupant's trigger row must render against (wide row vs rail icon).
 */
export interface SidebarSettingsOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/** Owner share of a nav row rendered under New chat. */
export interface SidebarNavActionOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/** Owner share of an action rendered beside Settings at the sidebar foot. */
export interface SidebarFooterActionOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/**
 * Owner share of the account row at the very bottom of the column: the same
 * column display state every foot occupant renders against (wide row vs rail
 * avatar). Who the row is about belongs to its occupant, not to this shell.
 */
export interface SidebarAccountOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

/**
 * Registrant-private injected share (arrives via the register inject
 * factory). The shell keeps only its own controls: starting a Session from
 * the New Session button and toggling the column.
 */
export type SidebarRootInjected = {
  /**
   * Start a New Session: with a workspace, reuse-or-create its blank session
   * and open it; without one, inherit the current Session Workspace, then the
   * recent Workspace, or clear into the New Session pure view when none exist.
   */
  startSession: (workspaceId?: WorkspaceId) => void
  /** Toggle the sidebar column through the layout service. */
  toggleSidebar: () => void
}

/**
 * Full component props: layout owner state/actions plus the declared holes'
 * render shares, this package's injected callbacks, and the standard locale
 * seat. No store is registered.
 */
export type SidebarRootComponentProps =
  PropsRuntime<'sidebar'>
  & PropsRenderSlots<
    | 'sidebar.brand.mark'
    | 'sidebar.brand.name'
    | 'sidebar.nav.action'
    | 'sidebar.workspaces'
    | 'sidebar.settings'
    | 'sidebar.footer.action'
    | 'sidebar.account'
  >
  & SidebarRootInjected & PropsLocale<'sidebar'>
