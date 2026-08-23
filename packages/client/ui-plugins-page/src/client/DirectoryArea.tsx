/**
 * The plugin directory: the product's catalogue, as something to choose from.
 *
 * This is a directory and not an inventory, and the difference decides every
 * layout choice here. An inventory answers "what is loaded" and is read by
 * whoever maintains the deployment — it wants density, identifiers, and every
 * row at once. A directory answers "what could I add" and is read by someone
 * deciding; it wants a name, a sentence in their own language, and one control
 * that changes their mind about it. So the rows are two to a line inside a
 * centred measure rather than four across the frame, and what each carries is
 * a mark, a name, a sentence and a single button.
 *
 * The measure that makes those two columns readable is the PAGE's, not this
 * area's: every occupant shares it, so this component sets none of its own.
 *
 * Grouping is the product's, not this component's: `category` arrives on each
 * row from the plugin's own manifest, and a heading appears for each value
 * present. What is NOT here is a group this page invented — a "Featured" run
 * with nothing behind it would be this component asserting an editorial
 * judgement the catalogue never made.
 */
import { useCallback, useMemo, useState } from 'react'
import {
  IconChevronDownOutline14, IconMinusOutline16, IconPlusOutline16, IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
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
 * How many publisher pills stand on the row before the rest fold behind More.
 *
 * The filters and the search field share one line, and a catalogue with a
 * publisher per plugin would push the field onto a line of its own — the
 * control a reader reaches for first would be the one that moved.
 */
const PILLS_SHOWN = 2

/**
 * The mark for one plugin: the publisher's image, or its initials.
 *
 * A directory row without a mark reads as a list item, and the eye uses the
 * mark to find its place again after reading a description. No publisher in
 * this catalogue has uploaded one yet, so initials carry that job — drawn in
 * the same neutral tile for every row, because a colour per plugin would be
 * this component inventing brand identity for someone else's product.
 * @param props - the row to mark and the alt text to give an image.
 * @returns the mark element.
 */
function Mark({ row, alt }: { row: DirectoryRow; alt: string }) {
  if (row.iconUrl !== null) {
    return <img className={css.mark} src={row.iconUrl} alt={alt} width={32} height={32} />
  }
  // The first character of each of the first two words, which turns
  // "financial-analysis" and "Market Researcher" into marks that differ.
  const initials = row.name
    .split(/[\s\-_]+/u)
    .filter(part => part !== '')
    .slice(0, 2)
    .map(part => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase()
  return <span className={clsx(css.mark, css.markInitials)} aria-hidden="true">{initials}</span>
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
  // Whether the folded publisher pills are open. Opening is one-way for the
  // life of the page: collapsing a row the reader just chose from would move
  // the pill they are aiming at.
  const [allPills, setAllPills] = useState(false)

  const plugins = state.status === 'ready' ? state.plugins : []
  const canInstall = state.status === 'ready' && state.canInstall

  // The publishers present, in first-seen order. Derived rather than declared
  // so a publisher the product adds tomorrow gets a pill without a release.
  const authors = useMemo(() => {
    const seen: string[] = []
    for (const row of plugins) {
      if (row.author !== '' && !seen.includes(row.author)) seen.push(row.author)
    }
    return seen
  }, [plugins])

  // The chosen publisher always stands on the row, even when it sits past the
  // cut: a filter the reader cannot see is a filter they cannot turn off.
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
  // page's word for "the manifest named no category", which is why it is a
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
    <section className={css.area}>
      <div className={css.controls}>
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
                    <button
                      type="button"
                      className={css.action}
                      // The control reads as its verb, not as its glyph: a mark
                      // that only says "check" tells a screen reader nothing
                      // about what pressing it will do.
                      aria-label={`${t(row.installed ? 'directory.remove' : 'directory.install')}: ${row.name}`}
                      // Only a plan limit and a write in flight take the control
                      // away. An installed row NEVER does: a tick drawn in the
                      // muted way a disabled control is drawn is what made this
                      // read as "already handled, nothing you can do".
                      disabled={busy || (!row.installed && !canInstall)}
                      onClick={() => { void act(row) }}
                    >
                      {row.installed
                        ? <IconMinusOutline16 size={16} />
                        : <IconPlusOutline16 size={16} />}
                    </button>
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
