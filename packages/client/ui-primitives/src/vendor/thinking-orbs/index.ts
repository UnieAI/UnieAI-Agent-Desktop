// @ts-nocheck -- Pinned upstream source (MIT, see ./LICENSE). This repository
// compiles with `noUncheckedIndexedAccess` and friends, which upstream does
// not; reformatting a pinned copy to satisfy them would destroy the one thing
// pinning buys — a clean diff against the version it came from. The seam that
// IS type-checked is `../../ThinkingOrb.tsx`, which is the only file allowed
// to import this tree.
export { ThinkingOrb } from './ThinkingOrb'

export type { ThinkingOrbProps, OrbState, OrbSize, OrbTheme } from './types'

// Power-user surface: the resolved presets + raw frame painters, for
// consumers driving their own canvas outside React.
export { resolvePreset, STATE_TO_MODE, type ModeKey, type Resolved } from './presets'
export { MODE_DRAWS } from './engine/registry'
