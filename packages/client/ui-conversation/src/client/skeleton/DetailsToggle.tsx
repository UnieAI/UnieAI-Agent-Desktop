/**
 * The header control that opens the details column.
 *
 * The column used to open only as a side effect of selecting a tool row, so
 * everything it can answer on its own — what this session produced, what is in
 * the workspace — was unreachable until someone clicked something else first.
 * This is the way in, and the way back out: one control both ways, because a
 * button that only opens leaves its own pressed state contradicting the panel.
 */

import type { DetailsToggleInjected } from '../contract/slots.ts'
import type { PropsLocale } from '@unieai/uad-client-ui-slots'
import css from './DetailsToggle.module.css'

/** Props of the details-column opener. */
export type DetailsToggleProps = DetailsToggleInjected & PropsLocale<'conversation'>

export function DetailsToggle({ toggleDetails, t }: DetailsToggleProps) {
  return (
    <button
      type="button" className={css.button} title={t('details.open')} aria-label={t('details.open')}
      onClick={() => { toggleDetails() }}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
        <rect
          x="1.75" y="2.75" width="12.5" height="10.5" rx="2"
          fill="none" stroke="currentColor" strokeWidth="1.3"
        />
        <path d="M10.25 2.75v10.5" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  )
}
