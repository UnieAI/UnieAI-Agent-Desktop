/** The one thing the first-run tour remembers, shared by both halves. */

import z from '@unieai/schemastery'

/** Settings namespace owned by the first-run tour. */
export const FIRST_RUN_SETTINGS_NAMESPACE = 'first-run'

/** Field set once, by finishing the tour or skipping it. */
export const FIRST_RUN_SEEN_FIELD = 'seen'

/** Durable first-run section shared by the Host schema and the browser scope. */
export interface FirstRunSettings {
  /** Whether this person has been shown the tour. */
  seen?: boolean
}

/**
 * The section's schema.
 *
 * Absent rather than `false` by default: "never asked" and "asked and
 * dismissed" are the same to this plugin, and a default of `false` would be a
 * stored answer nobody gave.
 */
export const FirstRunSettingsSchema: z<FirstRunSettings> = z.object({
  seen: z.boolean().description('Whether the first-run tour has been shown.'),
})
