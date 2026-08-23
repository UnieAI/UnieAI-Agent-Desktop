/**
 * The sidebar's Plugins nav row: the reference column's `Plugins` entry,
 * wired to the settings section dsh already ships for it. Pressing the row
 * opens this package's own panel at the `plugins` section through the shared
 * panel store — the row draws no plugin surface of its own.
 *
 * The row renders only while a `plugins` section is actually registered: a
 * composition without ui-settings-plugins has nothing behind the row, and a
 * row that opens the wrong page is worse than no row.
 */
import clsx from 'clsx'
import { IconBlocksOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginsNavRowComponentProps } from './shell-contract.ts'
import css from './PluginsNavRow.module.css'

/** Settings section this row opens; owned by ui-settings-plugins. */
const PLUGINS_SECTION_ID = 'plugins'

/**
 * Render the Plugins nav row.
 * @param props - composed slot props (contract in shell-contract.ts).
 * @returns the row button, or null while no plugins section is registered.
 */
export function PluginsNavRow({ wide, t, useSections, openPanel }: PluginsNavRowComponentProps) {
  const available = useSections(rows => rows.some(row => row.id === PLUGINS_SECTION_ID))
  if (!available) return null
  const label = t('nav.plugins')
  return (
    <button
      type="button"
      className={clsx(css.row, !wide && css.rail)}
      aria-label={label}
      title={wide ? undefined : label}
      onClick={() => { openPanel(PLUGINS_SECTION_ID) }}
    >
      <IconBlocksOutline16 className={css.icon} size={wide ? 15 : 18} />
      {wide && <span className={css.label}>{label}</span>}
    </button>
  )
}
