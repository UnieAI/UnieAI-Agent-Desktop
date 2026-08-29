/**
 * The first-run tour, node half.
 *
 * The tour itself is entirely a browser surface; what the host contributes is
 * the durable section holding its one answer, so a person who dismissed it
 * does not meet it again on the next launch. Registered only when a settings
 * provider exists — a deployment that keeps no preferences shows the tour
 * every time, which is the honest behaviour for one that cannot remember.
 *
 * @module @unieai/uad-client-ui-first-run
 */

import type { Context } from '@unieai/cordis'
import { settingsNamespace } from '@unieai/uad-settings'
import { FIRST_RUN_SETTINGS_NAMESPACE, FirstRunSettingsSchema } from './first-run-settings.ts'

export {
  FIRST_RUN_SEEN_FIELD, FIRST_RUN_SETTINGS_NAMESPACE, type FirstRunSettings,
} from './first-run-settings.ts'

/** Cordis plugin name. */
export const name = 'ui-first-run'

/**
 * Register the durable first-run section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(FIRST_RUN_SETTINGS_NAMESPACE), FirstRunSettingsSchema)
  })
}
