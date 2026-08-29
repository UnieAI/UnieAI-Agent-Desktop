/**
 * What the first run shows, and the one fact that decides whether it shows.
 *
 * @module @unieai/uad-client-ui-first-run/client/tour
 */

/** One step of the tour: a scene, and what it is for. */
export interface TourStep {
  /** Which scene to draw; each is a mock of the real interface with a cursor. */
  readonly scene: 'folder' | 'ask' | 'review' | 'machine'
  /** Locale key for the step's heading. */
  readonly title: 'step.folder.title' | 'step.ask.title' | 'step.review.title' | 'step.machine.title'
  /** Locale key for the sentence under it. */
  readonly body: 'step.folder.body' | 'step.ask.body' | 'step.review.body' | 'step.machine.body'
}

/**
 * The tour, in order.
 *
 * Four steps and no more: this runs before anybody has done anything, and a
 * person who wanted a manual would not be opening a chat window. Each one is
 * something they will have to do within the first minute — pick a folder, ask
 * for something, look at what it wants to change, and (only then) the fact
 * that it can run somewhere else.
 */
export const TOUR: readonly TourStep[] = [
  { scene: 'folder', title: 'step.folder.title', body: 'step.folder.body' },
  { scene: 'ask', title: 'step.ask.title', body: 'step.ask.body' },
  { scene: 'review', title: 'step.review.title', body: 'step.review.body' },
  { scene: 'machine', title: 'step.machine.title', body: 'step.machine.body' },
]

/** Where the tour is in its sequence. */
export interface TourPosition {
  /** Zero-based index into {@link TOUR}. */
  readonly index: number
  /** Whether a step before this one exists. */
  readonly hasPrevious: boolean
  /** Whether this is the last step, so the forward control finishes instead. */
  readonly isLast: boolean
}

/**
 * Describe one position in the tour.
 *
 * Derived rather than stored: two booleans kept beside an index are two more
 * things that can disagree with it.
 * @param index - the current step.
 * @param length - how many steps there are.
 * @returns the position.
 */
export function positionOf(index: number, length: number = TOUR.length): TourPosition {
  const clamped = Math.min(Math.max(index, 0), Math.max(length - 1, 0))
  return { index: clamped, hasPrevious: clamped > 0, isLast: clamped >= length - 1 }
}
