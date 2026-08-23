/**
 * The Plugins page: a frame-wide surface holding everything this product
 * calls a plugin.
 *
 * It is a page and not a settings section, and that is the whole change. The
 * word "plugin" had two meanings here — the account's MCP servers, which the
 * reference web product installs from its own Plugins page, and this
 * deployment's cordis registry, which the settings panel called Plugins and
 * which is developer-facing. One of them was reachable from a product-level
 * nav row and the other was not reachable at all. Both are areas on this page
 * now, stacked in `order` beside a read-only directory of everything the
 * Loader reports, and none of the three is what the word means on its own.
 *
 * The page draws only its own chrome. What an area is, what it reads, and
 * whether it can do anything are the area's business: this component renders
 * `plugins.page.area` and has no import from either occupant.
 *
 * The three occupants are TABS, not a stack. Each is a place of its own —
 * what the account can install, what it has connected, and what this build
 * loads — and stacking them made the page a scroll in which the directory's
 * 22 rows and the Loader's 128 sat end to end with nothing saying they were
 * different kinds of thing.
 *
 * The tab table below names entry ids from other packages, which is the one
 * place this page knows its occupants. That coupling is deliberate and gated:
 * `plugins.page.area` carries no per-entry label, so a generic strip would
 * have nothing to write on itself, and a test asserts the table covers every
 * id actually registered — an area added without a tab fails there rather
 * than disappearing from the page.
 *
 * Frame-wide rather than beside the sidebar: `shell.overlay` is the seat the
 * shell documents for a surface of one's own, and it spans the frame. The
 * page therefore carries its own way back (the header control, and Escape),
 * which is also why leaving it is a single gesture from anywhere on it.
 */
import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconChevronLeftOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginsPageComponentProps } from './contract/slots.ts'
import type { PluginsPageKey } from './locales.ts'
import css from './PluginsPage.module.css'
import tabCss from './PluginsTabs.module.css'

/** Identifier of one tab on the page. */
export type PluginsTabId = 'mcp' | 'directory' | 'deployment'

/**
 * The page's tabs, in the order they are read, and which registered areas each
 * one shows.
 *
 * `entries` names ids owned by other packages. `PLUGINS_PAGE_TABS` is exported
 * so the test that guards the coupling can compare it against what those
 * packages actually register.
 */
export const TABS = [
  { id: 'mcp', label: 'tab.mcp', entries: ['studio-mcp'] },
  { id: 'directory', label: 'tab.directory', entries: ['unieai-directory'] },
  // Two entries under one tab: the Loader's inventory and the deployment's
  // plugin configuration are both about what THIS build runs, and splitting
  // them would put two tabs on one subject.
  { id: 'deployment', label: 'tab.deployment', entries: ['plugin-directory', 'cordis-plugins'] },
] as const satisfies readonly {
  id: PluginsTabId
  label: PluginsPageKey
  entries: readonly string[]
}[]

/**
 * Render the Plugins page, or nothing while it is closed.
 * @param props - composed slot props (contract in contract/slots.ts).
 * @returns the page element tree, or null.
 */
export function PluginsPage({ t, renderSlot, usePage, close }: PluginsPageComponentProps) {
  const open = usePage(state => state.open)
  const [tab, setTab] = useState<PluginsTabId>(TABS[0].id)
  const headingId = useId()
  const surface = useRef<HTMLElement | null>(null)

  // Escape leaves the page. Bound on the document rather than on the surface
  // because the reader may be focused anywhere inside an area — a card's
  // input, a tab strip — and the gesture means the same thing from all of
  // them. Bound only while open, so a closed page listens for nothing.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, close])

  // Opening moves focus onto the page. Without it a keyboard reader who
  // pressed the sidebar row would still be standing in a column the page now
  // covers, and their next Tab would walk hidden controls.
  useEffect(() => {
    if (open) surface.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <section
      ref={surface}
      className={css.page}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-plugins-page
    >
      <header className={css.header}>
        {/* The way back sits in the frame's own corner, not on the reading
            column: it belongs to the window, and a reader looking for it looks
            at the edge of the screen rather than at the edge of the text. */}
        <div className={css.crumbs}>
          <button type="button" className={css.back} onClick={close}>
            <IconChevronLeftOutline14 className={css.backIcon} size={14} />
            {t('back')}
          </button>
          <span className={css.name}>{t('title')}</span>
        </div>
        <div className={css.measure}>
          {/* The proposition names the page; the word "Plugins" above only
              says where you are. Naming the section by the proposition is why
              a reader arriving by keyboard hears what this place is for. */}
          <h1 id={headingId} className={css.title}>{t('intro')}</h1>
        </div>
      </header>
      <div className={css.scroll}>
        <div className={css.measure}>
          <div className={tabCss.tabs} role="tablist">
            {TABS.map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={clsx(tabCss.tab, tab === entry.id && tabCss.tabActive)}
                onClick={() => { setTab(entry.id) }}
              >
                {t(entry.label)}
              </button>
            ))}
          </div>
          <div className={css.column}>
            {(TABS.find(entry => entry.id === tab) ?? TABS[0]).entries
              .map(id => renderSlot('plugins.page.area', {}, { only: id }))}
          </div>
        </div>
      </div>
    </section>
  )
}
