/**
 * The OpenPets "Codex" sprite format, and what an agent's activity looks like
 * in it.
 *
 * A Codex spritesheet is a fixed grid: 1536×1872, eight columns by nine rows
 * of 192×208 frames, one animation per row played left to right. Pets carry no
 * per-sheet metadata, so these numbers ARE the contract — a sheet that does
 * not match this grid renders as garbage rather than failing, which is why
 * they are stated once here and read by both halves.
 *
 * Ported from OpenPets (`@open-pets/core`, MIT — see
 * `src/vendor/openpets/LICENSE`).
 */

/** Frame width in the sheet, in pixels. */
export const FRAME_WIDTH = 192
/** Frame height in the sheet, in pixels. */
export const FRAME_HEIGHT = 208
/** Frames per row. */
export const COLUMNS = 8

/** One animation row of the sheet. */
export interface CodexState {
  /** Row index, from the top. */
  row: number
  /** How many of the row's eight cells this animation uses. */
  frames: number
  /** How long one full loop takes. */
  durationMs: number
}

/** Every animation the grid carries, in on-disk row order. */
export const CODEX_STATES = {
  idle: { row: 0, frames: 6, durationMs: 1100 },
  runningRight: { row: 1, frames: 8, durationMs: 1060 },
  runningLeft: { row: 2, frames: 8, durationMs: 1060 },
  waving: { row: 3, frames: 4, durationMs: 700 },
  jumping: { row: 4, frames: 5, durationMs: 840 },
  failed: { row: 5, frames: 8, durationMs: 1220 },
  waiting: { row: 6, frames: 6, durationMs: 1010 },
  running: { row: 7, frames: 6, durationMs: 820 },
  review: { row: 8, frames: 6, durationMs: 1030 },
} as const satisfies Record<string, CodexState>

/** What the mascot is reacting to. */
export type PetReaction = 'idle' | 'thinking' | 'working' | 'waiting' | 'celebrating' | 'failed'

/** Which row each reaction plays. */
const REACTION_ROWS: Readonly<Record<PetReaction, CodexState>> = {
  idle: CODEX_STATES.idle,
  // `review` reads as attention rather than motion, which is what a model
  // deciding what to do next looks like from outside.
  thinking: CODEX_STATES.review,
  working: CODEX_STATES.running,
  waiting: CODEX_STATES.waiting,
  celebrating: CODEX_STATES.jumping,
  failed: CODEX_STATES.failed,
}

/**
 * The animation a reaction plays.
 * @param reaction - what the mascot is reacting to.
 * @returns the row, frame count and loop duration.
 */
export function stateFor(reaction: PetReaction): CodexState {
  return REACTION_ROWS[reaction]
}

/**
 * Which cell of a row is showing at a given moment.
 *
 * Time-derived rather than counter-driven so every mounted mascot is in phase
 * and a paused tab resumes where the clock is, not where it stopped.
 * @param state - the animation being played.
 * @param elapsedMs - milliseconds since a shared clock's origin.
 * @returns zero-based frame index within the row.
 */
export function frameAt(state: CodexState, elapsedMs: number): number {
  if (state.frames <= 1 || state.durationMs <= 0) return 0
  const perFrame = state.durationMs / state.frames
  const index = Math.floor((elapsedMs % state.durationMs) / perFrame)
  // A clock that jumps (a resumed tab, a coarse timer) must not index past the
  // row's real frame count into the neighbouring animation.
  return Math.min(Math.max(index, 0), state.frames - 1)
}

/**
 * Where one frame sits in the sheet.
 * @param state - the animation being played.
 * @param frame - zero-based frame index within the row.
 * @returns the source rectangle to draw from.
 */
export function frameRect(state: CodexState, frame: number): { x: number; y: number } {
  return { x: (frame % COLUMNS) * FRAME_WIDTH, y: state.row * FRAME_HEIGHT }
}
