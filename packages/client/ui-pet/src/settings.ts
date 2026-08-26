/** The mascot preference, stored in the Host user-settings document. */

import z from '@unieai/schemastery'
import { DEFAULT_PET_ID } from './pets.ts'

/** Settings namespace owned by the mascot plugin. */
export const PET_SETTINGS_NAMESPACE = 'ui-pet'

/** Durable mascot section, shared by the Host schema and the browser scope. */
export interface PetSettings {
  /** Chosen pet id; one of the bundled ids. */
  pet: string
  /**
   * Whether the mascot is shown.
   *
   * Off by default. A companion that appears uninvited on first launch is a
   * surprise in the corner of a workspace, and the person who wants one will
   * go and turn it on.
   */
  enabled: boolean
}

/** Schema for the durable mascot section. */
export const PetSettingsSchema: z<PetSettings> = z.object({
  pet: z.string().default(DEFAULT_PET_ID),
  enabled: z.boolean().default(false),
})
