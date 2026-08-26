/**
 * The mascot's node half: it registers the preference and nothing else.
 *
 * The sprite sheets are static files served with the web app's own assets
 * (`apps/web/public/pets/`), not by a route here. A 1.7 MB grid imported by
 * the browser half would sit base64 inside `client.js` and be paid for on
 * every load, mascot or not; a route here would put filesystem code in a
 * package whose other half must never see it.
 *
 * @module @unieai/uad-client-ui-pet
 */

import type { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { settingsNamespace } from '@unieai/uad-settings'
import { PET_SETTINGS_NAMESPACE, PetSettingsSchema } from './settings.ts'

export { PETS, DEFAULT_PET_ID } from './pets.ts'
export type { PetEntry } from './pets.ts'
export { CODEX_STATES, frameAt, frameRect, stateFor } from './codex.ts'
export type { CodexState, PetReaction } from './codex.ts'
export { PET_SETTINGS_NAMESPACE, PetSettingsSchema } from './settings.ts'
export type { PetSettings } from './settings.ts'

/** Cordis plugin name. */
export const name = 'ui-pet'

/**
 * Register the durable mascot section when a settings provider exists.
 *
 * The row's own config becomes the section's BASE layer, so a deployment that
 * ships the mascot on says so in `cordis.yml` and a person's choice still
 * overrides it. Registering the schema alone would leave the composition
 * unable to say anything: the row's config would be read by nobody, and a
 * `enabled: true` in a bundle would silently do nothing.
 * @param ctx - Host context whose optional settings service owns the section.
 * @param config - the row's config, used as the composition layer.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(PET_SETTINGS_NAMESPACE),
      PetSettingsSchema,
      { base: config },
    )
  })
}

/**
 * What a composition may say about the mascot.
 *
 * Both fields are optional and carry no defaults: this is the BASE layer under
 * a person's own choice, and a default here would be a deployment stating a
 * preference it never expressed. The section's own defaults live on
 * `PetSettingsSchema`, which is what a reader with no layers at all gets.
 */
export interface Config {
  /** Pet shown when the person has not chosen one. */
  pet?: string
  /** Whether the mascot starts out shown. */
  enabled?: boolean
}

/** Schema for the row's config. */
export const Config: z<Config> = z.object({
  pet: z.string(),
  enabled: z.boolean(),
})
