/**
 * The sidebar's Plugins nav row: the reference column's `Plugins` entry,
 * wired to this package's page.
 *
 * This row replaces the one the settings shell used to draw. That one opened
 * the settings panel at a `plugins` section; this one opens a page, which is
 * what the word means in this product — Plugins is a destination, not a
 * preference. The old row hides itself whenever no `plugins` settings section
 * is registered, and moving the cordis surface onto this page is what makes
 * that condition true, so the two rows never appear together and nothing in
 * the settings shell had to change.
 */
import clsx from 'clsx'
import { IconBlocksOutline16 } from '@unieai/uad-client-ui-primitives'
import type { PluginsNavRowComponentProps } from './contract/slots.ts'
import css from './PluginsNavRow.module.css'

/**
 * Render the Plugins nav row.
 * @param props - composed slot props (contract in contract/slots.ts).
 * @returns the row button.
 */
export function PluginsNavRow({ wide, t, usePage, open }: PluginsNavRowComponentProps) {
  const current = usePage(state => state.open)
  const label = t('nav')
  return (
    <button
      type="button"
      className={clsx(css.row, !wide && css.rail)}
      aria-label={label}
      title={wide ? undefined : label}
      aria-current={current ? 'page' : undefined}
      data-current={current ? 'true' : undefined}
      onClick={open}
    >
      <IconBlocksOutline16 className={css.icon} size={wide ? 15 : 18} />
      {wide && <span className={css.label}>{label}</span>}
    </button>
  )
}
