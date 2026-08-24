/**
 * The session's workspace, one level at a time.
 *
 * Lazy by level, never recursive. A repository has more files than a panel can
 * hold and more than a person reads at once, so a directory is listed when it
 * is opened and not before — the cost of showing the tree is the cost of what
 * someone actually looked at.
 *
 * Names only. The Host operation behind this cannot return content, and the
 * bound it enforces (a registered workspace root, a path inside it) is not
 * restated here: a presenter that re-checked it would imply it could also
 * relax it.
 */

import { useEffect, useRef, useState } from 'react'
import type { WorkspaceEntry, WorkspaceListing } from '@unieai/uad-client-runtime/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import css from './DetailsPanel.module.css'

/** One directory level the tree has loaded, or the reason it could not. */
type Level =
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly WorkspaceEntry[]; truncated: boolean }
  | { status: 'failed'; message: string }

/** Props of the workspace file tree. */
export interface WorkspaceTreeProps {
  /** Absolute workspace root; the tree lists nothing outside it. */
  root: string
  /** Injected Host listing, bounded to `root`. */
  list: (root: string, path?: string, signal?: AbortSignal) => Promise<WorkspaceListing>
  /** Open a file in whatever the surface uses to show one. */
  onOpen: (path: string) => void
  /** Path currently shown beside the tree, marked as the current row. */
  selected?: string
  /** Lowercased substring the rows are filtered by; empty shows everything. */
  filter?: string
  /** Locale reader; keys live in the conversation namespace. */
  t: DetailsSlotProps['t']
}

export function WorkspaceTree({ root, list, onOpen, selected, filter, t }: WorkspaceTreeProps) {
  const [levels, setLevels] = useState<Record<string, Level>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({ [root]: true })
  // Which paths have been asked for, and the controller that can still cancel
  // them. Kept in refs because an effect that depended on the loading state it
  // writes would abort its own request on the render that state caused.
  const requested = useRef(new Set<string>())
  // One controller PER REQUEST, held so unmount can cancel whatever is still
  // in flight. A single long-lived controller cannot work here: React invokes
  // an effect twice on mount in development, and the first cleanup would abort
  // the one controller the ref keeps — every later request then carried an
  // already-aborted signal and no level ever arrived.
  const inFlight = useRef(new Map<string, AbortController>())

  useEffect(() => {
    for (const [path, isOpen] of Object.entries(open)) {
      if (!isOpen || requested.current.has(path)) continue
      requested.current.add(path)
      const live = new AbortController()
      inFlight.current.set(path, live)
      setLevels(current => ({ ...current, [path]: { status: 'loading' } }))
      list(root, path, live.signal).then(
        (listing) => {
          inFlight.current.delete(path)
          if (live.signal.aborted) return
          setLevels(current => ({
            ...current,
            [path]: { status: 'ready', entries: listing.entries, truncated: listing.truncated },
          }))
        },
        (error: unknown) => {
          inFlight.current.delete(path)
          if (live.signal.aborted) return
          // A failed level is retried when it is collapsed and opened again.
          requested.current.delete(path)
          setLevels(current => ({
            ...current,
            [path]: { status: 'failed', message: error instanceof Error ? error.message : String(error) },
          }))
        },
      )
    }
  }, [open, list, root])

  // Cancel whatever is still in flight, and RELEASE ITS PATH so a mount that
  // follows re-asks. React invokes an effect twice on mount in development:
  // without the release the second run saw the path already requested, skipped
  // it, and the tree sat on a scan the first cleanup had just cancelled.
  useEffect(() => {
    const scans = inFlight.current
    const asked = requested.current
    return () => {
      for (const [path, live] of scans) { live.abort(); asked.delete(path) }
      scans.clear()
    }
  }, [])

  const toggle = (path: string): void => {
    setOpen(current => ({ ...current, [path]: current[path] !== true }))
  }

  /** Render one level's rows at a nesting depth. */
  const rows = (path: string, depth: number): React.ReactNode => {
    const level = levels[path]
    if (level === undefined || level.status === 'loading') {
      return <li className={css.treeNote} style={{ paddingLeft: `${String(depth * 12 + 10)}px` }}>{t('files.loading')}</li>
    }
    if (level.status === 'failed') {
      return (
        <li className={css.treeNote} style={{ paddingLeft: `${String(depth * 12 + 10)}px` }} title={level.message}>
          {t('files.unreadable')}
        </li>
      )
    }
    // A filter hides rows, never levels: a directory whose own name misses the
    // filter may still hold the file someone is looking for, so it stays and
    // its children are filtered in turn.
    const shown = filter === undefined || filter === ''
      ? level.entries
      : level.entries.filter(
        entry => entry.kind === 'directory' || entry.name.toLowerCase().includes(filter),
      )
    return (
      <>
        {shown.map(entry => (
          <li key={entry.path}>
            <button
              type="button" className={css.treeRow} data-kind={entry.kind}
              data-current={entry.path === selected || undefined}
              style={{ paddingLeft: `${String(depth * 12 + 8)}px` }}
              onClick={() => {
                if (entry.kind === 'directory') toggle(entry.path)
                else onOpen(entry.path)
              }}
            >
              <span className={css.treeMark} aria-hidden>
                {entry.kind === 'directory'
                  ? (
                    <svg viewBox="0 0 12 12" width="10" height="10">
                      <path
                        d={open[entry.path] === true ? 'M2.5 4.25 6 8l3.5-3.75' : 'M4.25 2.5 8 6l-3.75 3.5'}
                        fill="none" stroke="currentColor" strokeWidth="1.3"
                        strokeLinecap="round" strokeLinejoin="round"
                      />
                    </svg>
                  )
                  : null}
              </span>
              <span className={css.treeIcon} aria-hidden>
                {entry.kind === 'directory'
                  ? null
                  : (
                    <svg viewBox="0 0 14 14" width="12" height="12">
                      <path
                        d="M3.25 1.75h4.5l3 3v7.5a.75.75 0 0 1-.75.75h-6.75a.75.75 0 0 1-.75-.75V2.5a.75.75 0 0 1 .75-.75z"
                        fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
                      />
                      <path d="M7.75 1.75v3h3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    </svg>
                  )}
              </span>
              <span className={css.treeName}>{entry.name}</span>
            </button>
            {entry.kind === 'directory' && open[entry.path] === true && (
              <ul className={css.tree}>{rows(entry.path, depth + 1)}</ul>
            )}
          </li>
        ))}
        {level.truncated && (
          // A cut level that said nothing would read as a complete one.
          <li className={css.treeNote} style={{ paddingLeft: `${String(depth * 12 + 10)}px` }}>{t('files.truncated')}</li>
        )}
      </>
    )
  }

  return <ul className={css.tree}>{rows(root, 0)}</ul>
}
