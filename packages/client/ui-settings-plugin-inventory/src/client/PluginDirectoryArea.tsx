/**
 * The plugin directory: every plugin this build loads, on the Plugins page.
 *
 * IT LISTS. IT DOES NOT INSTALL, ENABLE, DISABLE OR REMOVE, and it draws no
 * control that would suggest it could. `pluginInventory.list()` is the only
 * plugin RPC that exists on this deployment; installing is a CLI command
 * (`dsh plugin --profile web add <spec>`, a pnpm forwarder) and enablement is
 * a line in the profile's `cordis.patch.yml`. The reference directory's `+`
 * and `✓` would therefore fail on press, every time, so the trailing column
 * carries a runtime status DOT instead — a mark, not a button — and the
 * sentence under the list names the command that actually works.
 *
 * WHAT THE HEADINGS ARE, AND WHY THERE ARE ONLY TWO. The reference groups by
 * an editorial category (`Featured`, `Coding`) drawn from a curated
 * catalogue, and filters by provenance (`Curated by OpenAI`, `Shared with
 * you`) drawn from who published each plugin. This deployment has neither
 * fact. The wire carries exactly four fields per row — the Loader entry id,
 * the module specifier, effective enablement, and the root Fiber's phase — of
 * which one, `enabled`, is a stated partition. So the directory groups by it:
 * Enabled and Disabled, in Loader order inside each.
 *
 * The groupings NOT taken, and why:
 *   - By bundle (`dsh-base` / `dsh-web-app` / a profile-installed bundle).
 *     This is the true equivalent of the reference's provenance filter and it
 *     is the one worth having, but the composer applies each bundle's patch
 *     list over an empty root IN MEMORY and the resulting Loader entry keeps
 *     no memory of which layer inserted it. Nothing on the wire can be made
 *     to say it; see the README.
 *   - By host plane versus browser plane. Every browser row happens to be
 *     named `@deepseek-ai/dsh-client-*` — but `@deepseek-ai/dsh-api-remotes`
 *     is a browser row too, and `dsh-client-modules` is both. That is a
 *     naming convention with exceptions, not data, and segmentation dressed
 *     as taxonomy reads as fact.
 *   - By Fiber phase. Five buckets, four of them usually empty, and the row
 *     already carries its phase as the dot.
 *
 * THE ROW IS NOT A CARD. No border, no fill, no radius: a heading with a
 * hairline under it, and under that a reflowing grid of two-line rows. The
 * plain name is the title and the exact module specifier is the line beneath
 * it, in the code face, because that specifier is what a reader would have to
 * type. The Loader entry id is a coordinate into `cordis.patch.yml` rather
 * than a description of anything, so it is searchable and carried on the row
 * as `data-plugin-entry`, but it is not drawn: for all but a handful of rows
 * it repeats the title.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import { Button, IconSearchOutline16, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the Plugins page's SlotMap merge (the 'plugins.page.area'
// seat this directory occupies) so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-plugins-page/client'
import type { PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginDirectoryArea.module.css'

/** Registration-side Remote face used by the directory. */
export interface PluginDirectoryAreaInjected {
  /** Read a current Host inventory snapshot. */
  list: () => Promise<PluginInventorySnapshot>
}

type PluginInventoryEntry = PluginInventorySnapshot['entries'][number]
type PluginFiberPhase = PluginInventoryEntry['fiberPhase']

/** Full component props assembled by the Plugins page's slot renderer. */
export type PluginDirectoryAreaProps =
  PropsRuntime<'plugins.page.area'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<PluginDirectoryAreaInjected>

/** The translate seat the directory and its rows share. */
type Translate = PluginDirectoryAreaProps['t']

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

const PHASE_KEYS = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
} satisfies Record<Exclude<PluginFiberPhase, null>, PluginInventoryLocaleKey>

/** Localized accessible label for one root Fiber phase. */
function phaseLabel(phase: PluginFiberPhase, t: Translate): string {
  return phase === null ? t('unobserved') : t(PHASE_KEYS[phase])
}

/** Compact a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** Whether an inventory row matches the local directory query. */
function matches(entry: PluginInventoryEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [entry.moduleName, entry.entryId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * Render the read-only plugin directory.
 * @param props - composed slot props.
 * @returns the area element tree.
 */
export function PluginDirectoryArea({ list, t }: PluginDirectoryAreaProps): ReactNode {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredEntries = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.entries.filter(entry => matches(entry, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )

  // Two groups from the one field the wire states as a partition. Loader
  // order survives inside each, because that is the order the profile
  // composes them in and the only order the snapshot claims.
  const enabled = filteredEntries.filter(entry => entry.enabled)
  const disabled = filteredEntries.filter(entry => !entry.enabled)

  const retry = (): void => {
    setState({ status: 'loading' })
    setRequest(value => value + 1)
  }

  const total = state.status === 'ready' ? state.snapshot.entries.length : 0

  return (
    <section
      className={css.area}
      aria-label={t('title')}
      aria-busy={state.status === 'loading'}
      data-plugin-directory
    >
      {/* Collapsed by default, and the heading IS the control that opens it.
          This list reports the Loader's tree — 128 entries with names like
          `typert-registry` — and nothing on it can be acted on: the inventory
          service is read-only and cannot enable, disable, add or remove
          anything. Left open it was a wall of identifiers a reader could only
          scroll past, sitting under the same word as the plugins they CAN
          install. Whoever wants it opens it; the reading it gives is a
          deployment report, and reports are gone looking for. */}
      <details className={css.disclosure}>
        <summary className={css.summary}>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </summary>
        {state.status === 'loading' ? <p className={css.status}>{t('loading')}</p> : null}
        {state.status === 'error'
          ? (
            <>
              <p className={css.failure} role="alert">{t('error')}</p>
              <div className={css.actions}>
                <Button variant="outline" size="sm" onClick={retry}>{t('retry')}</Button>
              </div>
            </>
          )
          : null}
        {state.status === 'ready'
          ? (
            <>
              <Input
                className={clsx(css.search)}
                icon={<IconSearchOutline16 />}
                type="search"
                value={query}
                placeholder={t('search')}
                aria-label={t('search')}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
              {total === 0 ? <p className={css.status}>{t('empty')}</p> : null}
              {total > 0 && filteredEntries.length === 0
                ? <p className={css.status}>{t('emptySearch')}</p>
                : null}
              {filteredEntries.length > 0
                ? (
                  <div className={css.groups}>
                    <DirectoryGroup id="enabled" label={t('enabledTag')} rows={enabled} t={t} />
                    <DirectoryGroup id="disabled" label={t('disabledTag')} rows={disabled} t={t} />
                  </div>
                )
                : null}
              <p className={css.note}>{t('note')}</p>
            </>
          )
          : null}
      </details>
    </section>
  )
}

/**
 * One group: a heading, the count beside it, a hairline under both, and the
 * rows. A group with nothing in it draws nothing at all rather than an empty
 * heading — a search narrowing the list to enabled rows should not leave a
 * "Disabled 0" rule hanging under it.
 * @param props - the group's identity, localized heading, rows, and translate seat.
 * @returns the group element, or null when the group is empty.
 */
function DirectoryGroup(
  { id, label, rows, t }: {
    id: string
    label: string
    rows: readonly PluginInventoryEntry[]
    t: Translate
  },
): ReactNode {
  if (rows.length === 0) return null
  return (
    <section className={css.group} data-plugin-group={id}>
      <div className={css.groupHead}>
        <h3 className={css.groupName}>{label}</h3>
        <span className={css.count} data-plugin-count={rows.length}>{rows.length}</span>
      </div>
      <ul className={css.grid}>
        {rows.map(entry => <DirectoryRow key={entry.entryId} entry={entry} t={t} />)}
      </ul>
    </section>
  )
}

/**
 * One plugin.
 *
 * The dot is drawn only for enabled rows, because a disabled entry has no
 * root Fiber to have a phase — its group heading already said everything the
 * Loader knows about it, and a grey mark there would invite the reader to
 * hunt for a meaning that is not present.
 * @param props - the inventory row and the translate seat.
 * @returns the row list item.
 */
function DirectoryRow(
  { entry, t }: { entry: PluginInventoryEntry; t: Translate },
): ReactNode {
  const status = phaseLabel(entry.fiberPhase, t)
  return (
    <li className={css.row} data-plugin-entry={entry.entryId}>
      <span className={css.rowText}>
        <span className={css.rowName}>{moduleShortName(entry.moduleName)}</span>
        <span className={css.rowSpec} title={entry.moduleName}>{entry.moduleName}</span>
      </span>
      {entry.enabled
        ? (
          <span
            className={css.dot}
            data-phase={entry.fiberPhase ?? 'unobserved'}
            role="img"
            aria-label={status}
            title={status}
          />
        )
        : null}
    </li>
  )
}
