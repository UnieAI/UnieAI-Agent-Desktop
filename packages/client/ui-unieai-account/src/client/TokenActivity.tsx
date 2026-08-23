/**
 * Token Activity: the heatmap and the Daily / Weekly / Cumulative toggle over
 * it, in the arrangement the UnieAI web product's profile settings use — the
 * block's name on the left of one line, the segmented control on the right,
 * the grid under both.
 *
 * The toggle is the block's own state and is deliberately not lifted any
 * higher: it changes what the grid colours by and nothing else on the page
 * reads it. An account whose supplier reported the strip but no series says so
 * in one line instead of drawing an empty year, because a grid of 371 empty
 * cells reads as "you did nothing all year" rather than as "nothing was
 * reported".
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { Translate } from '@unieai/uad-client-ui-slots'
import type { UnieAiActivityDay } from '../account-contract.ts'
import { ActivityHeatmap, HEATMAP_MODES, type HeatmapMode } from './ActivityHeatmap.tsx'
import type { AccountKey } from './locales.ts'
import css from './ActivityHeatmap.module.css'

/** Copy key of each toggle segment. */
const MODE_LABELS: Readonly<Record<HeatmapMode, AccountKey>> = {
  daily: 'activity.daily',
  weekly: 'activity.weekly',
  cumulative: 'activity.cumulative',
}

/** Props of the Token Activity block. */
export interface TokenActivityProps {
  /** Days that recorded usage, ascending. */
  daily: readonly UnieAiActivityDay[]
  /** Active locale id, which names the months under the grid. */
  locale: string
  /** Section copy. */
  t: Translate<AccountKey>
}

/**
 * Render the Token Activity block.
 * @param props - the series, the locale, and section copy.
 * @returns the block's element tree.
 */
export function TokenActivity({ daily, locale, t }: TokenActivityProps) {
  const [mode, setMode] = useState<HeatmapMode>('daily')
  return (
    <section className={css.activity}>
      <div className={css.activityHead}>
        <h3 className={css.activityTitle}>{t('activity.title')}</h3>
        <div className={css.toggle} role="group" aria-label={t('activity.title')}>
          {HEATMAP_MODES.map(one => (
            <button
              key={one}
              type="button"
              className={clsx(css.toggleButton, one === mode && css.toggleButtonOn)}
              aria-pressed={one === mode}
              onClick={() => { setMode(one) }}
            >
              {t(MODE_LABELS[one])}
            </button>
          ))}
        </div>
      </div>
      {daily.length === 0
        ? <p className={css.empty}>{t('activity.empty')}</p>
        : <ActivityHeatmap daily={daily} mode={mode} locale={locale} t={t} />}
    </section>
  )
}
