/**
 * The mascot's browser half: it draws the pet over the app and offers the
 * choice in the plugins section.
 *
 * The pet is a preference, so it lives where preferences live — the settings
 * card is registered into `settings.plugin.item`, keyed by this feature's own
 * namespace, which is how a plugin that ships a browser half owns its own row
 * without the tab knowing what the namespace means.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the overlay seat and the plugin-card slot are declared by other
// packages; cross-plugin collaboration goes through slots and services, never
// a value import (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-layout/client'
import type {} from '@unieai/uad-client-ui-settings-plugins/src/client/slot-contract.ts'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
// Type-only: pulls the settings plugin's `ctx.settingsScope` Context merge.
import type {} from '@unieai/uad-client-ui-settings/client'
import { DEFAULT_PET_ID } from '../pets.ts'
import { PetDock } from './PetDock.tsx'
import type { PetDockInjected } from './PetDock.tsx'
import { PetSettingsCard } from './PetSettingsCard.tsx'
import type { PetSettingsCardInjected } from './PetSettingsCard.tsx'
import { createPetView } from './pet-view.ts'
import { PET_SETTINGS_NAMESPACE } from '../settings.ts'
import type { PetSettings } from '../settings.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type { PetDockProps, PetState, PetView } from './PetDock.tsx'
export type { PetSettings } from '../settings.ts'
export { reactionOf } from './pet-view.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.pet'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'sessions', 'settingsScope']

/**
 * Register the mascot and its settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-pet: copy dictionaries',
  )

  const settings = ctx.settingsScope.bind<PetSettings>({ namespace: PET_SETTINGS_NAMESPACE })
  const view = createPetView(ctx.sessions, settings, DEFAULT_PET_ID)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'pet-dock',
    // Below the sign-in gate (1000): a mascot over a locked door would be the
    // only moving thing on a screen that is asking for something else.
    order: 100,
    inject: (): PetDockInjected => ({ hooks: { pet: view } }),
  }, PetDock))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    // Keyed by the namespace this card edits: the tab dispatches per
    // namespace and never learns what one means.
    key: PET_SETTINGS_NAMESPACE,
    locale: NS,
    inject: (): PetSettingsCardInjected => ({
      hooks: { pet: view },
      settings,
    }),
  }, PetSettingsCard))
}
