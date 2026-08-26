/**
 * The thinking orb: what a surface shows while the model is still working.
 *
 * The drawing is `src/vendor/thinking-orbs` — Jakub Antalik's MIT component,
 * pinned as upstream source (see its LICENSE beside it) and rendered on a
 * canvas. It is the same component the UnieAI Copilot web product shows in a
 * reasoning row, which is the point: one product, one thinking animation.
 *
 * This file is the seam between that copy and this repository's conventions.
 * Callers get a `size`-only face with no upstream vocabulary in it, so the
 * pinned copy can be re-synced without touching a call site, and the orb's
 * many draw modes stay an implementation detail of the one this product uses.
 */

import type { ReactNode } from 'react'
import { ThinkingOrb as VendorThinkingOrb } from './vendor/thinking-orbs/ThinkingOrb.tsx'

/** Props of {@link ThinkingOrb}. */
export interface ThinkingOrbProps {
  /**
   * Edge length in CSS pixels.
   *
   * Two sizes exist because they are two DESIGNS, not a scale factor: the
   * vendored copy tunes dot count, dot size and speed per size. 20 is the
   * inline-text scale the web product uses in a reasoning row; 64 is the
   * avatar scale.
   */
  size?: 20 | 64
  /** Accessible label; omit inside a control that already names the state. */
  label?: string
}

/**
 * Render the animated thinking orb.
 *
 * The animation pauses itself while offscreen or while the tab is hidden, and
 * reduced-motion readers get one static frame — all three are the vendored
 * component's own behavior, not something a caller opts into.
 * @param props - size and optional accessible label.
 * @returns the orb canvas.
 */
export function ThinkingOrb({ size = 20, label }: ThinkingOrbProps): ReactNode {
  return (
    <VendorThinkingOrb
      // `solving` is the product's reasoning state; the other modes exist
      // upstream for surfaces this repository does not have.
      state="solving"
      size={size}
      theme="auto"
      {...label === undefined ? { 'aria-hidden': true } : { 'aria-label': label }}
    />
  )
}
