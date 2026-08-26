// @ts-nocheck -- Pinned upstream source (MIT, see ./LICENSE). This repository
// compiles with `noUncheckedIndexedAccess` and friends, which upstream does
// not; reformatting a pinned copy to satisfy them would destroy the one thing
// pinning buys — a clean diff against the version it came from. The seam that
// IS type-checked is `../../ThinkingOrb.tsx`, which is the only file allowed
// to import this tree.
// Engine-level contracts shared by every mode implementation.

import type { ModeOpts } from './profiles'

export type { Dot } from './core'

/** One frame painter: draws a mode into a 2D context at CSS-px `size`. */
export type ModeDraw = (
  ctx: CanvasRenderingContext2D,
  size: number,
  t: number,
  dark: boolean,
  opts: ModeOpts,
) => void
