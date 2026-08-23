/**
 * Completion-cue catalog and its per-device preference.
 *
 * The catalog and the storage key are the UnieAI Copilot web product's, so a
 * user who set a cue there recognises the same eleven names here. The choice
 * is deliberately per-device rather than a synced setting: which cue suits a
 * machine depends on that machine's speakers and where it sits.
 *
 * The clips are served by the web shell from `apps/web/public/sounds/notify`;
 * this module only names them. They are this repository's own synthesised
 * cues, not the web product's audio, so the ids are shared and the bytes are
 * not.
 */

/** One selectable cue: its clip id and the name shown in the picker. */
export interface NotifySound {
  /** Clip id — the basename of the served `.wav`, and the stored value. */
  readonly id: string
  /** Picker label (a product name, identical across locales). */
  readonly label: string
}

/** The selectable cues, in picker order; the first is the default. */
export const NOTIFY_SOUNDS: readonly NotifySound[] = [
  { id: 'handoff', label: 'Handoff' },
  { id: 'antic', label: 'Antic' },
  { id: 'cheer', label: 'Cheer' },
  { id: 'droplet', label: 'Droplet' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'passage', label: 'Passage' },
  { id: 'portal', label: 'Portal' },
  { id: 'rattle', label: 'Rattle' },
  { id: 'rebound', label: 'Rebound' },
  { id: 'slide', label: 'Slide' },
  { id: 'welcome', label: 'Welcome' },
]

/** Cue used until the user picks another one. */
export const DEFAULT_NOTIFY_SOUND = 'handoff'

/** Per-device preference cell (the web product's key, kept identical). */
export const NOTIFY_SOUND_STORAGE_KEY = 'unieai:notify-sound'

/** Directory the web shell serves the clips from. */
const NOTIFY_SOUND_BASE = '/sounds/notify'

/**
 * Locate one cue's clip.
 * @param id - clip id from {@link NOTIFY_SOUNDS}.
 * @returns the shell-relative URL of that clip.
 */
export function notifySoundUrl(id: string): string {
  return `${NOTIFY_SOUND_BASE}/${id}.wav`
}

/**
 * Whether an id names a cue this build ships.
 * @param id - candidate clip id.
 * @returns true when the catalog contains it.
 */
export function isNotifySoundId(id: string): boolean {
  return NOTIFY_SOUNDS.some(sound => sound.id === id)
}

/** The per-device preference cell, narrowed to what this module needs. */
export interface NotifySoundStorage {
  /**
   * Read one key.
   * @param key - storage key.
   * @returns the stored value, or null when absent.
   */
  getItem(key: string): string | null
  /**
   * Write one key.
   * @param key - storage key.
   * @param value - value to store.
   */
  setItem(key: string, value: string): void
}

/**
 * The browser's own preference cell, when this runtime has one.
 * @returns `localStorage`, or undefined outside a browser (node e2e boots the
 * client tree without one) or when the browser refuses storage.
 */
export function browserNotifySoundStorage(): NotifySoundStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    // A privacy mode that throws on property access has no storage to offer.
    return undefined
  }
}

/**
 * Read the chosen cue.
 * @param storage - preference cell; absent or unreadable yields the default.
 * @returns a catalog id — a stored id this build dropped falls back to the default.
 */
export function readNotifySoundId(storage: NotifySoundStorage | undefined): string {
  if (storage === undefined) return DEFAULT_NOTIFY_SOUND
  let stored: string | null
  try {
    stored = storage.getItem(NOTIFY_SOUND_STORAGE_KEY)
  } catch {
    return DEFAULT_NOTIFY_SOUND
  }
  return stored !== null && isNotifySoundId(stored) ? stored : DEFAULT_NOTIFY_SOUND
}

/**
 * Persist the chosen cue. A full or refusing quota is not worth failing a
 * preference click over, so the write is best-effort.
 * @param storage - preference cell; absent means the choice lives for this page only.
 * @param id - catalog id to store.
 */
export function writeNotifySoundId(storage: NotifySoundStorage | undefined, id: string): void {
  if (storage === undefined) return
  try {
    storage.setItem(NOTIFY_SOUND_STORAGE_KEY, id)
  } catch {
    // Storage full or refused: the in-memory choice still holds for this page.
  }
}

/** Plays one cue. Separated from the catalog so suites can observe the call. */
export interface NotifySoundPlayer {
  /**
   * Play one cue.
   * @param id - catalog id.
   */
  play(id: string): void
}

/** Playback level: loud enough to carry from another window, short of startling. */
const NOTIFY_SOUND_VOLUME = 0.7

/**
 * Build the player backed by the browser's audio element.
 * @returns a player that is a no-op wherever `Audio` is absent (node e2e).
 */
export function browserNotifySoundPlayer(): NotifySoundPlayer {
  return {
    play(id: string): void {
      /* v8 ignore next -- jsdom defines Audio; the guard covers node e2e boots */
      if (typeof Audio === 'undefined') return
      try {
        const audio = new Audio(notifySoundUrl(id))
        audio.volume = NOTIFY_SOUND_VOLUME
        // Autoplay policy rejects until the page has been interacted with, and
        // a missing clip rejects too. Neither is worth surfacing: the cue is an
        // accompaniment to a notification the user can already see.
        void audio.play().catch(() => {})
      } catch {
        // Audio unavailable in this runtime.
      }
    },
  }
}
