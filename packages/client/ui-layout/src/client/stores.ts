/**
 * The root entry's transient layout store: panel geometry as plain widths in
 * px (0 = closed). Module level exports the factory only — a module-level
 * handle would pin the store's identity in the module
 * cache (a de-facto singleton surviving plugin reloads). register() receives
 * the factory (exclusive use: the framework instantiates per entry), AppFrame
 * derives its PropsStore share from the return type, and the service face
 * receives the bound actions through the registration's inject hook.
 */
import { defineStore, type EngineStoreHandle } from '@unieai/uad-client-runtime/client'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/**
 * Layout store state: panel width preferences in px (0 = closed), plus the
 * narrow-viewport pair — `narrow` mirrors AppFrame's breakpoint reading
 * (viewport < SIDEBAR_AUTO_COLLAPSE) so toggleSidebar can pick semantics, and
 * `narrowExpanded` is the manual override that re-expands the auto-collapsed
 * sidebar over the squeezed center without rewriting the width preference.
 */
type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  /**
   * Whether the right column is showing a document rather than tool details.
   * One column, two possible occupants: a document is a place to work, tool
   * details are a place to look, and showing both at once on a laptop leaves
   * neither usable. The document wins while it is open, and closing it
   * returns the column to details.
   */
  document: boolean
  /**
   * Width the details panel held before it was maximized, so the toggle has
   * somewhere to go back to. Absent whenever the panel is not maximized; a
   * drag while maximized clears it, because the drag IS the new preference.
   */
  detailsRestore?: number
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
  openDocument: (draft: LayoutState) => void
  closeDocument: (draft: LayoutState) => void
  toggleDetails: (draft: LayoutState) => void
  toggleDetailsMaximized: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. The preference IS the width, so
 * closing a panel forgets its drag width — reopening restores the contract
 * default. Actions are the complete write set: drag writes clamp
 * into the panel's contract range and never cross the open/closed line;
 * open/close transitions write 0 / the default explicitly. Below the
 * auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
 * flips the narrowExpanded override instead of the preference.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      sidebar: SIDEBAR_DEFAULT, details: 0, narrow: false, narrowExpanded: false, document: false,
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => {
        d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX)
        // A drag states a width outright; keeping a restore point from before
        // it would send the toggle back to a width nobody asked for twice.
        delete d.detailsRestore
      },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      // One control opens and closes: a button that only opens leaves the
      // column with no way back except its own close, which the opener's
      // pressed state then contradicts.
      toggleDetails: (d) => {
        if (d.details === 0) { d.details = DETAILS_DEFAULT; return }
        d.details = 0
        delete d.detailsRestore
      },
      toggleDetailsMaximized: (d) => {
        // Closed has nothing to widen, and widening it would open the panel
        // as a side effect of a button that does not say "open".
        if (d.details === 0) return
        if (d.detailsRestore !== undefined) {
          d.details = clampWidth(d.detailsRestore, DETAILS_MIN, DETAILS_MAX)
          delete d.detailsRestore
          return
        }
        d.detailsRestore = d.details
        d.details = DETAILS_MAX
      },
      closeDetails: (d) => { d.details = 0 },
      // Opening a document opens the column it needs; the width contract is
      // the details column's, because it IS that column.
      openDocument: (d) => {
        d.document = true
        if (d.details === 0) d.details = DETAILS_DEFAULT
      },
      // The document owned the column while it was open, so closing it closes
      // the column: returning to an empty details panel would leave a blank
      // third of the screen behind a document nobody asked to keep.
      closeDocument: (d) => {
        d.document = false
        d.details = 0
        delete d.detailsRestore
      },
    },
  })
  return handle
}
