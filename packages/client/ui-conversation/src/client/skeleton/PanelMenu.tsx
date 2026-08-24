/**
 * What the details column can open.
 *
 * One list, two placements: the empty column shows it in place, and the tab
 * strip's `+` shows it as a dropdown. Sharing the component is what keeps the
 * two from drifting into different menus for the same act.
 */

import type { DetailsSlotProps } from '../contract/slots.ts'

/** Locale key of a menu row's name. */
type PanelLabel = Parameters<DetailsSlotProps['t']>[0]
import css from './PanelMenu.module.css'

/** What one menu row opens. */
export type PanelItemId = 'produced' | 'files'

/** One row: what it opens, and how it is labelled. */
interface PanelItem {
  id: PanelItemId
  /** Locale key for the row's name. */
  label: PanelLabel
}

/*
 * No keyboard hints. The reference design shows one per row, and this build
 * binds none of them — a hint beside a row that does nothing when pressed
 * teaches someone the menu lies. They come back with the bindings.
 */

/**
 * The rows, in the order the column offers them.
 *
 * Terminal and browser belong here too and are absent until they exist: a row
 * that opens nothing teaches someone the menu is unreliable.
 */
export const PANEL_ITEMS: readonly PanelItem[] = [
  { id: 'produced', label: 'panel.produced' },
  { id: 'files', label: 'panel.files' },
]

/**
 * The glyph for one row.
 * @param id - the row.
 * @returns its icon.
 */
function ItemIcon({ id }: { id: PanelItemId }) {
  if (id === 'files') {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
        <path
          d="M1.75 4.25a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"
          fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** Props of the open-what menu. */
export interface PanelMenuProps {
  /** Open one item; the caller owns whether the menu then closes. */
  onOpen: (id: PanelItemId) => void
  /** `menu` floats over the strip; `panel` fills the empty column. */
  placement: 'menu' | 'panel'
  t: DetailsSlotProps['t']
}

export function PanelMenu({ onOpen, placement, t }: PanelMenuProps) {
  return (
    <div className={css.root} data-placement={placement} role="menu">
      {PANEL_ITEMS.map(item => (
        <button
          key={item.id} type="button" role="menuitem" className={css.item}
          onClick={() => { onOpen(item.id) }}
        >
          <span className={css.icon}><ItemIcon id={item.id} /></span>
          <span className={css.label}>{t(item.label)}</span>
        </button>
      ))}
    </div>
  )
}
