/**
 * Choosing the pet, and turning it off.
 *
 * A card in the plugins section rather than a page of its own: the mascot is
 * one preference with two fields, and a page would promise more than there is.
 * Each pet shows its own preview, because a name is not what someone is
 * choosing between.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import type { SettingsScope } from '@unieai/uad-client-runtime/client'
import { DEFAULT_PET_ID, PETS } from '../pets.ts'
import type { PetState, PetView } from './PetDock.tsx'
import type { PetSettings } from '../settings.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.pet').
import type {} from './locales.ts'
import css from './PetSettingsCard.module.css'

/** What the card needs, bound at registration. */
export interface PetSettingsCardInjected {
  hooks: {
    /** The same view the dock renders from, so the card shows the live pet. */
    pet: PetView
  }
  /** This feature's settings scope; the card writes `pet` and `enabled`. */
  settings: SettingsScope<PetSettings>
}

/** Full component props: runtime share + locale seat + injected face. */
export type PetSettingsCardProps =
  PropsRuntime<'settings.plugin.item'> & PropsLocale<'settings.pet'>
  & InjectFace<PetSettingsCardInjected>

/**
 * Render the pet picker.
 * @param props - composed slot props.
 * @returns the card.
 */
export function PetSettingsCard(props: PetSettingsCardProps): ReactNode {
  const { t, usePet, settings } = props
  const state: PetState = usePet(snapshot => snapshot)
  const enabled = state.petId !== undefined
  const selected = state.petId ?? DEFAULT_PET_ID

  return (
    <li className={css['card']}>
      <div className={css['head']}>
        <span className={css['title']}>{t('title')}</span>
        <label className={css['toggle']}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => { void settings.set('enabled', event.target.checked) }}
          />
          {t('show')}
        </label>
      </div>
      <p className={css['body']}>{t('body')}</p>
      <ul className={css['pets']} aria-label={t('title')}>
        {PETS.map(pet => (
          <li key={pet.id}>
            <button
              type="button"
              className={css['pet']}
              aria-pressed={enabled && pet.id === selected}
              disabled={!enabled}
              onClick={() => { void settings.set('pet', pet.id) }}
            >
              {/* The preview, not the sheet: a 1.7 MB sprite grid per row
                  would download the whole catalogue to draw two thumbnails. */}
              <img className={css['preview']} src={`/pets/${pet.id}/preview.webp`} alt="" width={48} height={52} />
              <span>{pet.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}
