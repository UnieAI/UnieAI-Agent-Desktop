/**
 * The plugin directory: the product's catalogue, as something to choose from.
 *
 * This is a directory and not an inventory, and the difference decides every
 * layout choice here. An inventory answers "what is loaded" and is read by
 * whoever maintains the deployment — it wants density, identifiers, and every
 * row at once. A directory answers "what could I add" and is read by someone
 * deciding; it wants a name, a sentence in their own language, and one control
 * that changes their mind about it.
 *
 * The order down the area is search, then what this account already has, then
 * the filters, then the catalogue by category. It is the reference design's
 * order, and it reads as one question narrowing: everything, then mine, then
 * this slice, then these rows.
 *
 * The measure that makes the two row columns readable is the SURFACE's, not
 * this area's: every occupant shares it, so this component sets none of its
 * own.
 *
 * WHAT IS NOT DRAWN, AND WHY. Grouping is the product's: `category` arrives on
 * each row from the plugin's own manifest, and a heading appears for each
 * value present. There is no "Featured" run and no "Productivity" run written
 * into this file — the catalogue never made that editorial judgement, and a
 * heading with a fixed name would be this component asserting one. There is
 * likewise no public/personal segmented control: no field on the wire
 * distinguishes them (`DirectoryRow`), so the segment in that position is the
 * one filter the catalogue can actually answer — all, installed, or one
 * publisher.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronDownOutline14, IconEllipsisOutline16, IconSearchOutline16,
} from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import clsx from 'clsx'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import type { DirectoryRow, DirectorySource } from './directory-source.ts'
import css from './DirectoryArea.module.css'

/** Injected business face of the directory area (slot `inject`). */
export interface DirectoryAreaInjected {
  hooks: {
    /** Catalogue state, bound by the UI renderer as useDirectory. */
    directory: DirectorySource
  }
  /** Re-read the catalogue from the host. */
  refresh: () => void
  /** Install one plugin; settles once the catalogue behind it has been re-read. */
  install: (slug: string) => Promise<void>
  /** Remove one plugin from this account. */
  remove: (slug: string) => Promise<void>
}

/** Full component props: runtime share + locale seat + injected face. */
export type DirectoryAreaComponentProps =
  PropsRuntime<'plugins.page.area'> & PropsLocale<'plugins'>
  & InjectFace<DirectoryAreaInjected>

/**
 * Which filter pill is down.
 *
 * A tagged value rather than a magic string, because the third case carries a
 * publisher's name: a sentinel string would collide the day a publisher calls
 * itself "All", and the collision would silently widen the filter instead of
 * failing.
 */
type Pill =
  | { kind: 'all' }
  | { kind: 'installed' }
  | { kind: 'author'; author: string }

/**
 * How many publisher pills stand on the segment before the rest fold behind
 * More. Past three the segment wraps onto a second line and stops reading as
 * one control.
 */
const PILLS_SHOWN = 2

/**
 * The initials standing in for a publisher's mark.
 *
 * The first character of each of the first two words, which turns
 * "financial-analysis" and "Market Researcher" into marks that differ.
 * @param name - the plugin's display name.
 * @returns one or two uppercase characters.
 */
function initialsOf(name: string): string {
  return name
    .split(/[\s\-_]+/u)
    .filter(part => part !== '')
    .slice(0, 2)
    .map(part => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * The mark for one plugin: the publisher's image, or its initials.
 *
 * A directory row without a mark reads as a list item, and the eye uses the
 * mark to find its place again after reading a description. No publisher in
 * this catalogue has uploaded one yet, so initials carry that job — drawn in
 * the same neutral tile for every row, because a colour per plugin would be
 * this component inventing brand identity for someone else's product.
 * @param props - the row to mark, the tile size class, and the alt text.
 * @returns the mark element.
 */
function Mark({ row, alt, tile }: { row: DirectoryRow; alt: string; tile?: string | undefined }) {
  const className = clsx(css.mark, tile)
  if (row.iconUrl !== null) {
    return <img className={className} src={row.iconUrl} alt={alt} />
  }
  return (
    <span className={clsx(className, css.markInitials)} aria-hidden="true">{initialsOf(row.name)}</span>
  )
}

/**
 * Render the directory.
 * @param props - see {@link DirectoryAreaComponentProps}.
 * @returns the area element tree.
 */
export function DirectoryArea({ t, useDirectory, refresh, install, remove }: DirectoryAreaComponentProps) {
  const state = useDirectory(snapshot => snapshot)
  const [query, setQuery] = useState('')
  const [pill, setPill] = useState<Pill>({ kind: 'all' })
  // Which row is mid-write. Kept as a slug rather than a boolean so two quick
  // presses on different rows each show their own control busy.
  const [pending, setPending] = useState<string | null>(null)
  // Which installed row has its overflow open, as a slug: one menu at a time,
  // and the open one survives the list re-rendering under it.
  const [menu, setMenu] = useState<string | null>(null)
  // Whether the folded publisher pills are open. Opening is one-way for the
  // life of the surface: collapsing a segment the reader just chose from would
  // move the pill they are aiming at.
  const [allPills, setAllPills] = useState(false)
  const area = useRef<HTMLElement | null>(null)

  const plugins = state.status === 'ready' ? state.plugins : []
  const canInstall = state.status === 'ready' && state.canInstall

  // An open menu closes on the next press anywhere else. Bound on the document
  // rather than through a blur handler because a press that lands on the page
  // background moves focus nowhere, and the menu would stay open over it.
  useEffect(() => {
    if (menu === null) return undefined
    const onDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && area.current?.contains(target) === true) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('pointerdown', onDown) }
  }, [menu])

  const installed = useMemo(() => plugins.filter(row => row.installed), [plugins])

  // The publishers present, in first-seen order. Derived rather than declared
  // so a publisher the product adds tomorrow gets a pill without a release.
  const authors = useMemo(() => {
    const seen: string[] = []
    for (const row of plugins) {
      if (row.author !== '' && !seen.includes(row.author)) seen.push(row.author)
    }
    return seen
  }, [plugins])

  // The chosen publisher always stands on the segment, even when it sits past
  // the cut: a filter the reader cannot see is a filter they cannot turn off.
  const shownAuthors = useMemo(() => {
    if (allPills) return authors
    const head = authors.slice(0, PILLS_SHOWN)
    if (pill.kind === 'author' && !head.includes(pill.author)) head.push(pill.author)
    return head
  }, [authors, allPills, pill])

  const folded = authors.length - shownAuthors.length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return plugins.filter((row) => {
      if (pill.kind === 'installed' && !row.installed) return false
      if (pill.kind === 'author' && row.author !== pill.author) return false
      if (needle === '') return true
      // Name and description both, because a reader searching "earnings" is
      // as likely to be remembering the sentence as the title.
      return row.name.toLowerCase().includes(needle)
        || row.description.toLowerCase().includes(needle)
    })
  }, [plugins, pill, query])

  // Groups in first-seen order, so the catalogue's own ordering survives.
  // Ungrouped rows collect under one trailing heading; that heading is this
  // package's word for "the manifest named no category", which is why it is a
  // dictionary key rather than a value from the wire.
  const groups = useMemo(() => {
    const order: string[] = []
    const byCategory = new Map<string, DirectoryRow[]>()
    for (const row of visible) {
      const key = row.category
      if (!byCategory.has(key)) {
        byCategory.set(key, [])
        order.push(key)
      }
      byCategory.get(key)?.push(row)
    }
    // The unnamed group sorts last whatever order it was met in: it is the
    // remainder, and a remainder at the top reads as the main event.
    order.sort((left, right) => (left === '' ? 1 : 0) - (right === '' ? 1 : 0))
    return order.map(key => ({ key, rows: byCategory.get(key) ?? [] }))
  }, [visible])

  const act = useCallback(async (row: DirectoryRow) => {
    setMenu(null)
    setPending(row.slug)
    try {
      if (row.installed) await remove(row.slug)
      else await install(row.slug)
    } finally {
      setPending(null)
    }
  }, [install, remove])

  if (state.status === 'loading') {
    return <section className={css.area}><p className={css.note}>{t('directory.loading')}</p></section>
  }
  if (state.status === 'unsupported') {
    return (
      <section className={css.area}>
        <p className={css.note}>{t('directory.unsupported')}</p>
      </section>
    )
  }
  if (state.status === 'signed-out') {
    return (
      <section className={css.area}>
        <p className={css.note}>{t('directory.signedOut')}</p>
      </section>
    )
  }
  if (state.status === 'failed') {
    return (
      <section className={css.area}>
        <p className={css.note}>{t('directory.failed')}</p>
        <button type="button" className={css.retry} onClick={refresh}>{t('directory.retry')}</button>
      </section>
    )
  }

  return (
    <section
      className={css.area}
      ref={area}
      onKeyDown={(event) => { if (event.key === 'Escape' && menu !== null) setMenu(null) }}
    >
      {/* The field runs the full measure and comes first: a directory is
          searched before it is browsed, and a field sharing a line with the
          filters was the smaller half of that line. */}
      <label className={css.search}>
        <IconSearchOutline16 className={css.searchIcon} size={16} />
        <input
          className={css.searchInput}
          type="search"
          value={query}
          placeholder={t('directory.searchPlaceholder')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
      </label>

      {/* What this account already has, as marks rather than rows: the reader
          recognises their own plugins by the tile, and the list below is where
          anything is read. Absent entirely when nothing is installed — an
          empty strip under a heading says less than no strip. */}
      {installed.length > 0
        ? (
          <section className={css.installed}>
            <h3 className={css.sectionTitle}>{t('directory.installedTitle')}</h3>
            <div className={css.tiles}>
              {installed.map(row => (
                <span key={row.slug} className={css.tile} title={row.name}>
                  <Mark row={row} alt={row.name} tile={css.markLarge} />
                </span>
              ))}
            </div>
          </section>
        )
        : null}

      <div className={css.filters} role="group" aria-label={t('directory.filterLabel')}>
        <button
          type="button"
          className={clsx(css.pill, pill.kind === 'all' && css.pillActive)}
          aria-pressed={pill.kind === 'all'}
          onClick={() => { setPill({ kind: 'all' }) }}
        >
          {t('directory.filterAll')}
        </button>
        <button
          type="button"
          className={clsx(css.pill, pill.kind === 'installed' && css.pillActive)}
          aria-pressed={pill.kind === 'installed'}
          onClick={() => { setPill({ kind: 'installed' }) }}
        >
          {t('directory.filterInstalled')}
        </button>
        {shownAuthors.map(author => (
          <button
            key={author}
            type="button"
            className={clsx(css.pill, pill.kind === 'author' && pill.author === author && css.pillActive)}
            aria-pressed={pill.kind === 'author' && pill.author === author}
            onClick={() => { setPill({ kind: 'author', author }) }}
          >
            {author}
          </button>
        ))}
        {folded > 0
          ? (
            <button
              type="button"
              className={css.pill}
              onClick={() => { setAllPills(true) }}
            >
              {t('directory.filterMore')}
              <IconChevronDownOutline14 className={css.pillChevron} size={14} />
            </button>
          )
          : null}
      </div>

      {groups.length === 0
        ? <p className={css.note}>{plugins.length === 0 ? t('directory.empty') : t('directory.noMatch')}</p>
        : groups.map(group => (
          <section key={group.key || 'ungrouped'} className={css.group}>
            <h3 className={css.groupTitle}>
              {group.key === '' ? t('directory.groupOther') : group.key}
            </h3>
            <div className={css.grid}>
              {group.rows.map((row) => {
                const busy = pending === row.slug
                return (
                  <div key={row.slug} className={css.row}>
                    <Mark row={row} alt={row.author || row.name} />
                    <span className={css.rowText}>
                      <span className={css.rowName}>{row.name}</span>
                      <span className={css.rowDesc}>{row.description}</span>
                    </span>
                    {row.installed
                      ? (
                        // An installed row's only remaining action is removal,
                        // and a removal control standing open on every row a
                        // reader already chose is an invitation to undo them.
                        // It folds behind the overflow the reference draws.
                        <span className={css.overflow}>
                          <button
                            type="button"
                            className={css.more}
                            aria-label={`${t('directory.overflow')}: ${row.name}`}
                            aria-haspopup="menu"
                            aria-expanded={menu === row.slug}
                            disabled={busy}
                            onClick={() => { setMenu(current => (current === row.slug ? null : row.slug)) }}
                          >
                            <IconEllipsisOutline16 size={16} />
                          </button>
                          {menu === row.slug
                            ? (
                              <span className={css.menu} role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={css.menuItem}
                                  onClick={() => { void act(row) }}
                                >
                                  {t('directory.remove')}
                                </button>
                              </span>
                            )
                            : null}
                        </span>
                      )
                      : (
                        <button
                          type="button"
                          className={css.install}
                          // The control reads as its verb: a reader scanning a
                          // column of rows decides on the word, not on a glyph.
                          aria-label={`${t('directory.install')}: ${row.name}`}
                          // Only a plan limit and a write in flight take the
                          // control away.
                          disabled={busy || !canInstall}
                          onClick={() => { void act(row) }}
                        >
                          {t('directory.install')}
                        </button>
                      )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

      {!canInstall && plugins.length > 0
        ? <p className={css.note}>{t('directory.planNote')}</p>
        : null}
    </section>
  )
}
