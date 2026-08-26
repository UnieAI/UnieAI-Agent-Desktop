/**
 * The vision route: which model looks at pictures on behalf of models that
 * cannot see one.
 *
 * It sits on this page rather than in its own section because it is a MODEL
 * choice — the same list, filtered to the models some provider says accept
 * images. The choices come from the catalog, not from settings: whether a
 * model can see is the provider's answer, and a route whose adapter never says
 * stays out rather than being offered on a guess.
 *
 * Writing it names `tool-image-inspect`'s own namespace, and that plugin
 * follows the change live — the tool appears or withdraws without a restart,
 * which is what makes this a setting rather than a note to edit a file.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient } from '@unieai/uad-api-remotes/client'
import type { en } from './locales.ts'
import { messageOf, VISION_NS } from './store.ts'
import type { VisionModelOption, VisionRoute } from './store.ts'
import styles from './ModelsSection.module.css'

/** What the card needs from the page. */
export interface VisionModelCardProps {
  /** Every image-capable model, across every route. */
  options: readonly VisionModelOption[]
  /** The route currently configured, when one is. */
  current: VisionRoute | undefined
  /** Whether the settings provider accepts writes. */
  writable: boolean
  /** The wire face; only `settings.mutate` is used. */
  api: Pick<IApiClient, 'settings'>
  /** Locale lookup for this section. */
  t: (key: keyof typeof en) => string
  /** Re-read the page after a committed write. */
  onSaved: () => void
}

/** The empty selection, which is also what "no vision model" writes. */
const NONE = ''

/**
 * Render the vision-route chooser.
 * @param props - options, current route, and the write face.
 * @returns the card.
 */
export function VisionModelCard(props: VisionModelCardProps): ReactNode {
  const { options, current, writable, api, t, onSaved } = props
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)

  // The option value is the row's INDEX, not the route spelled into one
  // string: provider and model ids each allow every separator worth choosing,
  // and a value that could be split two ways is a route written to the wrong
  // place.
  const indexOf = (route: VisionRoute): number =>
    options.findIndex(option => option.provider === route.provider && option.model === route.model)
  const selectedIndex = current === undefined ? -1 : indexOf(current)
  const selected = selectedIndex < 0 ? NONE : String(selectedIndex)

  const choose = (value: string): void => {
    setFailure(undefined)
    setSaved(false)
    setSaving(true)
    const chosen = options[Number(value)]
    // Both halves move together: a provider without a model is a half-written
    // route, and the tool reads that as dormant.
    const ops = value === NONE || chosen === undefined
      ? [{ op: 'unset' as const, path: ['provider'] }, { op: 'unset' as const, path: ['model'] }]
      : [
        { op: 'set' as const, path: ['provider'], value: chosen.provider },
        { op: 'set' as const, path: ['model'], value: chosen.model },
      ]
    void api.settings.mutate({ ns: VISION_NS, ops })
      .then((response) => {
        if (!response.result.ok) throw new Error(response.result.error.message)
        setSaved(true)
        onSaved()
      })
      .catch((error: unknown) => { setFailure(messageOf(error)) })
      .finally(() => { setSaving(false) })
  }

  return (
    <div className={styles['rowCard']}>
      <div className={styles['rowHead']}>
        <span className={styles['rowIdentity']}>
          <span className={styles['rowName']}>{t('visionTitle')}</span>
        </span>
      </div>
      <p className={styles['intro']}>{t('visionBody')}</p>
      {options.length === 0
        ? <p className={styles['notice']}>{t('visionEmpty')}</p>
        : (
          <select
            className={`${styles['input']} ${styles['selectInput']}`}
            aria-label={t('visionTitle')}
            value={selected}
            disabled={!writable || saving}
            onChange={(event) => { choose(event.target.value) }}
          >
            <option value={NONE}>{t('visionNone')}</option>
            {options.map((option, index) => (
              <option key={`${option.provider}/${option.model}`} value={String(index)}>
                {`${option.providerName} · ${option.modelName}`}
              </option>
            ))}
          </select>
        )}
      {saving ? <p className={styles['notice']}>{t('visionSaving')}</p> : null}
      {saved && !saving
        ? <p className={styles['savedNotice']} role="status" aria-live="polite">{t('visionSaved')}</p>
        : null}
      {failure === undefined
        ? null
        : <p className={styles['error']}>{`${t('visionFailed')} ${failure}`}</p>}
    </div>
  )
}
