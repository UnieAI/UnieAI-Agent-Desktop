/**
 * The workspace, as the details column shows it: a file beside the tree it
 * came from.
 *
 * The tree stays visible while a file is open. Picking the next file is the
 * commonest thing someone does after reading one, and a viewer that replaced
 * the tree would make that a navigation instead of a click.
 *
 * READ ONLY. The Host operation behind this returns text and has no write
 * counterpart; nothing here can save.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded } from '@unieai/uad-client-ui-primitives'
import type { WorkspaceFile, WorkspaceListing } from '@unieai/uad-client-runtime/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import { WorkspaceTree } from './WorkspaceTree.tsx'
import { fileName } from './artifacts.ts'
import css from './FileBrowser.module.css'

/** What the viewer currently holds for the open path. */
type Content =
  | { status: 'loading' }
  | { status: 'ready'; file: WorkspaceFile }
  | { status: 'failed'; message: string }

/** Props of the file browser. */
export interface FileBrowserProps {
  /** Absolute workspace root; nothing outside it is reachable. */
  root: string
  /** The file shown beside the tree, or undefined for the empty placeholder. */
  path?: string
  list: (root: string, path?: string, signal?: AbortSignal) => Promise<WorkspaceListing>
  read: (root: string, path: string, signal?: AbortSignal) => Promise<WorkspaceFile>
  /** Open a file, which the container turns into its own tab. */
  onOpen: (path: string) => void
  /**
   * Hand the path to the operating system's editor, or undefined when that
   * would open it on a machine this reader is not sitting at.
   */
  onOpenExternally?: ((path: string) => void) | undefined
  t: DetailsSlotProps['t']
}

/**
 * The path as a breadcrumb, rooted at the workspace's own folder name.
 * @param root - the workspace root.
 * @param path - the open file.
 * @returns the crumbs, workspace first and file last.
 */
function crumbsOf(root: string, path: string): string[] {
  const inside = path.startsWith(root) ? path.slice(root.length) : path
  return [fileName(root), ...inside.split(/[\\/]/u).filter(part => part !== '')]
}

export function FileBrowser({ root, path, list, read, onOpen, onOpenExternally, t }: FileBrowserProps) {
  const [filter, setFilter] = useState('')
  // The tree is the way to the next file, so it stays open by default; a
  // reader who wants the code wide can put it away and it stays away.
  const [treeOpen, setTreeOpen] = useState(true)
  const [content, setContent] = useState<Content | undefined>(undefined)
  const controller = useRef<AbortController>(new AbortController())

  useEffect(() => {
    if (path === undefined) { setContent(undefined); return }
    const live = new AbortController()
    setContent({ status: 'loading' })
    read(root, path, live.signal).then(
      (file) => { if (!live.signal.aborted) setContent({ status: 'ready', file }) },
      (error: unknown) => {
        if (live.signal.aborted) return
        setContent({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
      },
    )
    // A superseded file supersedes its own read: the answer would land in a
    // viewer showing something else.
    return () => { live.abort() }
  }, [root, path, read])

  useEffect(() => {
    const live = controller.current
    return () => { live.abort() }
  }, [])

  const lines = content?.status === 'ready' ? (content.file.text ?? '').split('\n') : []
  // The highlighter's alias table accepts file extensions directly (`ts`,
  // `py`, `rs`, …), so the extension IS the language hint — no second
  // extension-to-language table to drift from the read tool's.
  const extension = path === undefined ? undefined : /\.([A-Za-z0-9]+)$/u.exec(path)?.[1]?.toLowerCase()
  // A lazily-loaded grammar arrives after the first render; the count changing
  // is what re-tokenizes a file that showed plain while its language loaded.
  const grammars = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const highlighted = useMemo(
    () => (content?.status === 'ready' && content.file.text !== undefined
      ? highlightLines(content.file.text, extension)
      : undefined),
    [content, extension, grammars])

  return (
    <div className={css.root}>
      <div className={css.main}>
        {/* Always present: the tree toggle is a property of this surface, not
            of whether a file happens to be open, and the row that carries it
            cannot appear and vanish under the pointer. */}
        <div className={css.crumbs}>
          <div className={css.trail}>
            {(path === undefined ? [fileName(root)] : crumbsOf(root, path)).map((crumb, index, all) => (
              <span key={`${crumb}:${String(index)}`} className={css.crumb} data-last={index === all.length - 1 || undefined}>
                {index > 0 && <span className={css.crumbSep} aria-hidden>›</span>}
                {crumb}
              </span>
            ))}
          </div>
          <div className={css.crumbActions}>
            {path !== undefined && onOpenExternally !== undefined && (
              <button
                type="button" className={css.external} onClick={() => { onOpenExternally(path) }}
              >
                {t('panel.openExternally')}
              </button>
            )}
            <button
              type="button" className={css.treeToggle} aria-pressed={treeOpen}
              aria-label={t(treeOpen ? 'panel.hideTree' : 'panel.showTree')}
              title={t(treeOpen ? 'panel.hideTree' : 'panel.showTree')}
              onClick={() => { setTreeOpen(current => !current) }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <rect
                  x="1.75" y="2.75" width="12.5" height="10.5" rx="2"
                  fill="none" stroke="currentColor" strokeWidth="1.2"
                />
                <path d="M10.25 2.75v10.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
        {path === undefined
          ? (
            <div className={css.placeholder}>
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden className={css.placeholderMark}>
                <path
                  d="M3.25 6.75a1.5 1.5 0 0 1 1.5-1.5h4l2 2h7.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5z"
                  fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
                />
              </svg>
              <div className={css.placeholderTitle}>{t('panel.filePlaceholder')}</div>
              <div className={css.placeholderBody}>{t('panel.filePlaceholderBody')}</div>
            </div>
          )
          : (
            <>
              <div className={css.viewer}>
                {content === undefined || content.status === 'loading'
                  ? <div className={css.note}>{t('files.loading')}</div>
                  : content.status === 'failed'
                    ? <div className={css.note} title={content.message}>{t('files.unreadable')}</div>
                    : content.file.text === undefined
                      // The Host withheld it; saying which bound was hit beats an
                      // empty viewer that reads as an empty file.
                      ? <div className={css.note}>{t(content.file.reason === 'binary' ? 'files.binary' : 'files.tooLarge')}</div>
                      : (
                        <table className={css.code}>
                          <tbody>
                            {lines.map((line, index) => (
                              <tr key={index}>
                                <td className={css.gutter}>{index + 1}</td>
                                <td className={css.line}>
                                  {/* The read card's own token runs, without the
                                      card: this surface already has a header,
                                      and a second banner plus copy control
                                      inside it is chrome for chrome. */}
                                  {highlighted?.[index] === undefined
                                    ? (line === '' ? ' ' : line)
                                    : highlighted[index].map((run, runIndex) => (
                                      <span key={runIndex} style={run.style}>{run.text}</span>
                                    ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
              </div>
            </>
          )}
      </div>
      {treeOpen && (
        <aside className={css.side}>
          <input
            type="search" className={css.filter} value={filter} placeholder={t('panel.filter')}
            onChange={(event) => { setFilter(event.target.value) }}
          />
          <div className={css.tree}>
            <WorkspaceTree
              root={root} list={list} onOpen={onOpen} t={t}
              filter={filter.trim().toLowerCase()}
              {...path === undefined ? {} : { selected: path }}
            />
          </div>
        </aside>
      )}
    </div>
  )
}
