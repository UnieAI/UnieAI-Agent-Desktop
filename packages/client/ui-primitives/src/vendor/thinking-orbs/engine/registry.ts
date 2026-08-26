// @ts-nocheck -- Pinned upstream source (MIT, see ./LICENSE). This repository
// compiles with `noUncheckedIndexedAccess` and friends, which upstream does
// not; reformatting a pinned copy to satisfy them would destroy the one thing
// pinning buys — a clean diff against the version it came from. The seam that
// IS type-checked is `../../ThinkingOrb.tsx`, which is the only file allowed
// to import this tree.
// Mode key → frame painter. Kept separate from the presets so tree
// shaking can in principle drop unused modes in custom builds.

import type { ModeKey } from '../presets'
import type { ModeDraw } from './types'
import { drawGlobe, drawRubik, drawWave } from './lattice'
import { drawMorph } from './morph'
import { drawOrbits } from './orbits'
import { drawRibbon } from './ribbon'

export const MODE_DRAWS: Record<ModeKey, ModeDraw> = {
  orbits: drawOrbits,
  globe: drawGlobe,
  rubik: drawRubik,
  wave: drawWave,
  ribbon: drawRibbon,
  morph: drawMorph,
}
