/**
 * The pets this product ships.
 *
 * One list, read by both halves: the node half serves `<id>/spritesheet.webp`
 * from the vendored directory, the browser half draws it and offers the
 * choice. A pet added to the directory but not to this list is not offered,
 * which is the intended direction — the sheets are vendored files and adding
 * one is a deliberate act.
 */

/** One pet a person can choose. */
export interface PetEntry {
  /** Directory name under the vendored asset root; also the setting's value. */
  id: string
  /** Name shown in the picker. */
  displayName: string
}

/** Pet shown before anyone chooses. */
export const DEFAULT_PET_ID = 'boxcat'

/** Every bundled pet, in picker order. */
export const PETS: readonly PetEntry[] = [
  { id: 'boxcat', displayName: 'Box Cat' },
  { id: 'bitty', displayName: 'Bitty' },
]
