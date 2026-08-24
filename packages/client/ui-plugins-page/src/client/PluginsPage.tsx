/**
 * The Plugins surface: a view in the frame's MAIN AREA, beside the navigation
 * column rather than over it.
 *
 * WHY BESIDE. Plugins is a destination, and a destination the reader reached
 * from the sidebar has to leave the sidebar standing: the row they pressed is
 * what says where they are, and covering it takes that answer away along with
 * every other place they might go next. The seat is still `shell.overlay` —
 * the frame documents no other additive root surface — but the surface offsets
 * itself by `--dsh-shell-sidebar-width`, the frame's own rendered column width
 * (ui-layout's `SIDEBAR_WIDTH_PROPERTY`), so the column stays visible at every
 * width, through a drag, and through the narrow-viewport auto-collapse.
 *
 * The page draws only its own chrome. What a destination shows, what it reads,
 * and whether it can do anything are the registered areas' business: this
 * component renders `plugins.page.area` and imports none of its occupants.
 *
 * THREE DESTINATIONS, TWO ON THE STRIP. The plugin directory and skills are
 * places a reader browses, so they sit on the pill strip at the top left. The
 * third — the account's MCP servers, the Loader's inventory, and this build's
 * cordis configuration — is what the deployment IS rather than what can be
 * added to it, so it hangs off the gear at the top right, where the reference
 * design puts configuration. All three are one-at-a-time: stacking them made
 * the surface a scroll in which a 22-row catalogue and the Loader's 128 sat
 * end to end with nothing saying they were different kinds of thing.
 *
 * The view table below names entry ids from other packages, which is the one
 * place this surface knows its occupants. That coupling is deliberate:
 * `plugins.page.area` carries no per-entry label, so a generic strip would
 * have nothing to write on itself.
 */
import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconCloseOutline16, IconRefreshOutline16, IconSettingsOutline16,
} from '@unieai/uad-client-ui-primitives'
import type { PluginsPageComponentProps } from './contract/slots.ts'
import type { PluginsPageKey } from './locales.ts'
import css from './PluginsPage.module.css'
import chrome from './PluginsTabs.module.css'

/** Identifier of one destination on the surface. */
export type PluginsViewId = 'directory' | 'skills' | 'manage'

/**
 * The surface's destinations, and which registered areas each one shows.
 *
 * `entries` names ids owned by other packages. `VIEWS` is exported so the test
 * that guards the coupling can compare it against what those packages
 * actually register.
 */
export const VIEWS = [
  // The Studio entry stands above the catalogue: it is this product's own
  // integration and the rest of the destination is everyone else's.
  { id: 'directory', title: 'title', intro: 'intro', entries: ['unieai-studio', 'unieai-directory'] },
  { id: 'skills', title: 'skills.title', intro: 'skills.intro', entries: ['skills'] },
  // Three entries under one destination: the account's connected servers, the
  // Loader's inventory, and the deployment's plugin configuration all answer
  // "what does this install already consist of", and each draws its own
  // heading, so they stack without a strip between them.
  {
    id: 'manage',
    title: 'manage.title',
    intro: 'manage.intro',
    entries: ['studio-mcp', 'plugin-directory', 'cordis-plugins'],
  },
] as const satisfies readonly {
  id: PluginsViewId
  title: PluginsPageKey
  intro: PluginsPageKey
  entries: readonly string[]
}[]

/** The destinations that appear as pill tabs; `manage` is reached by the gear. */
export const TAB_VIEWS = ['directory', 'skills'] as const satisfies readonly PluginsViewId[]

/**
 * Render the Plugins view, or nothing while it is closed.
 * @param props - composed slot props (contract in contract/slots.ts).
 * @returns the view element tree, or null.
 */
export function PluginsPage({ t, renderSlot, usePage, close, refresh }: PluginsPageComponentProps) {
  const open = usePage(state => state.open)
  const [view, setView] = useState<PluginsViewId>(VIEWS[0].id)
  const current = VIEWS.find(entry => entry.id === view) ?? VIEWS[0]
  const headingId = useId()
  const surface = useRef<HTMLElement | null>(null)

  // Escape leaves the surface. Bound on the document rather than on the
  // surface because the reader may be focused anywhere inside an area — a
  // card's input, a filter strip — and the gesture means the same thing from
  // all of them. Bound only while open, so a closed surface listens for
  // nothing.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, close])

  // Opening moves focus onto the surface. Without it a keyboard reader who
  // pressed the sidebar row would still be standing in the conversation the
  // surface now covers, and their next Tab would walk hidden controls.
  useEffect(() => {
    if (open) surface.current?.focus()
  }, [open])

  // The gear is a toggle, not a fourth tab: pressing it a second time returns
  // to the destination the reader came from rather than leaving them in
  // configuration with no marked way back on the strip.
  const toggleManage = useCallback(() => {
    setView(previous => (previous === 'manage' ? VIEWS[0].id : 'manage'))
  }, [])

  if (!open) return null

  return (
    <section
      ref={surface}
      className={css.view}
      aria-labelledby={headingId}
      tabIndex={-1}
      data-plugins-page
    >
      <header className={css.bar}>
        <div className={chrome.tabs} role="tablist">
          {TAB_VIEWS.map((id) => {
            const entry = VIEWS.find(candidate => candidate.id === id) ?? VIEWS[0]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                className={clsx(chrome.tab, view === id && chrome.tabActive)}
                onClick={() => { setView(id) }}
              >
                {t(entry.title)}
              </button>
            )
          })}
        </div>
        <div className={css.actions}>
          <button
            type="button"
            className={chrome.action}
            aria-label={t('refresh')}
            title={t('refresh')}
            onClick={refresh}
          >
            <IconRefreshOutline16 size={16} />
          </button>
          <button
            type="button"
            className={clsx(chrome.action, view === 'manage' && chrome.actionActive)}
            aria-label={t('manage.title')}
            title={t('manage.title')}
            aria-pressed={view === 'manage'}
            onClick={toggleManage}
          >
            <IconSettingsOutline16 size={16} />
          </button>
          {/* The way back. The sidebar row is the other one — it marks itself
              while the reader stands here — but a surface that covers the
              conversation must carry a leave gesture of its own, because the
              rows beside it switch sessions underneath rather than closing
              this. */}
          <button
            type="button"
            className={chrome.action}
            aria-label={t('back')}
            title={t('back')}
            onClick={close}
          >
            <IconCloseOutline16 size={16} />
          </button>
        </div>
      </header>
      <div className={css.scroll}>
        <div className={css.measure}>
          <h1 id={headingId} className={css.title}>{t(current.title)}</h1>
          <p className={css.subtitle}>{t(current.intro)}</p>
          <div className={css.column}>
            {current.entries.map(id => (
              <Fragment key={id}>{renderSlot('plugins.page.area', {}, { only: id })}</Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
