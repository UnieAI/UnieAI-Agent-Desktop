/**
 * Pure concession-chain column solver for the three-column AppFrame.
 * Chain order is fixed by contract: keep center >= CENTER_MIN by shrinking
 * details, then auto-closing it (derived zero width — preferred width
 * preferences are never rewritten, so widening the window restores them).
 * The sidebar never concedes: its rendered width is always the drag
 * preference (or the collapsed rail), and center absorbs any remaining
 * deficit as the last resort. Inputs are the layout store's plain width
 * preferences (0 = closed); a closed sidebar resolves to the fixed
 * SIDEBAR_COLLAPSED control rail while closed details resolve to zero width.
 * The SIDEBAR_AUTO_COLLAPSE breakpoint is consumed by AppFrame, which decides
 * the effective sidebar preference before solving; the solver itself stays
 * breakpoint-free.
 */

/** Resolved widths for one frame; center may drop below CENTER_MIN only at the final fallback. */
export interface Columns { sidebar: number; center: number; details: number }

// Contract-frozen geometry: the three-column concession chain's fixed points.
/** Center column floor; only the final fallback may go below it. */
export const CENTER_MIN = 640
/**
 * Whether the details panel is maximized, as the solver takes it.
 *
 * Maximizing is not a wide drag. A drag concedes against the center's floor,
 * which is what caps a dragged panel near half the frame. Maximizing says the
 * panel IS the surface being read: the center goes to zero and the panel takes
 * everything beside the sidebar, ceiling included. One press puts it back, and
 * the transcript is never unmounted — only given no width.
 */
export type DetailsMaximized = boolean
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag: the reference column's own 264px. */
export const SIDEBAR_DEFAULT = 264
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Details drag clamp floor. */
export const DETAILS_MIN = 320
/**
 * Details drag clamp ceiling.
 *
 * The column now holds a file viewer beside its tree, so the old 520 ceiling
 * left roughly 280px for code — narrower than the lines it had to show. The
 * center keeps its own CENTER_MIN floor, so raising this cannot squeeze the
 * transcript away; the solver simply refuses the preference that would.
 */
export const DETAILS_MAX = 1200
/** Details width before any user drag. */
export const DETAILS_DEFAULT = 560

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame. Pure: no hysteresis —
 * the output is a function of (viewport, preferences) only, so recovery on
 * re-widening is automatic. Preferences re-clamp here because they cross the
 * store boundary and callers may still supply stale ranges.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @param maximized - when true the center yields entirely and the panel takes
 * the whole frame beside the sidebar, past {@link DETAILS_MAX}.
 * @returns resolved widths; details 0 means visually closed (never unmounted), while a closed sidebar keeps its compact rail.
 */
export function computeColumns(
  viewport: number, sidebar: number, details: number, maximized: DetailsMaximized = false,
): Columns {
  // The sidebar is fixed at its preference (or the rail) — it never concedes.
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)

  // Maximized: the center yields completely. Not a concession step — the
  // chain below concedes against a floor, and a floor is exactly what this
  // state exists to leave behind.
  if (maximized && details !== 0) return { sidebar: s, center: 0, details: Math.max(0, viewport - s) }

  // Step 1: everything fits at preferred widths.
  if (s + d0 + CENTER_MIN <= viewport) return { sidebar: s, center: viewport - s - d0, details: d0 }

  // Step 2: shrink details toward its minimum.
  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 }

  // Step 3: auto-close details (derived — preferences untouched); center
  // absorbs any remaining deficit (may drop below CENTER_MIN).
  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}
