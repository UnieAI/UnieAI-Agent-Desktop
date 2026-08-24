/**
 * The workspace, as the details column shows it: a file beside the tree it
 * came from.
 *
 * The tree stays visible while a file is open. Picking the next file is the
 * commonest thing someone does after reading one, and a viewer that replaced
 * the tree would make that a navigation instead of a click.
 *
 * EDITABLE, AND GUARDED. Saving goes back through the Host's write, which
 * carries the version the read returned: a file an agent changed while this
 * buffer sat open refuses the save rather than discarding that work. The
 * editor then says so and offers to re-read, which is the only honest move —
 * this surface cannot merge, and pretending otherwise loses someone's edit
 * either way.
 *
 * A file the Host withheld (too large, or binary) has no editor: there is
 * nothing to edit, and a blank textarea over a file with content is a way to
 * empty it by accident.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded } from '@unieai/uad-client-ui-primitives'
import type { WorkspaceFile, WorkspaceListing } from '@unieai/uad-client-runtime/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import { WorkspaceTree } from './WorkspaceTree.tsx'
import { fileName } from './artifacts.ts'
import css from './FileBrowser.module.css'

/** What a save is currently doing. */
type SaveState =
  | { status: 'clean' }
  | { status: 'dirty' }
  | { status: 'saving' }
  | { status: 'stale' }
  | { status: 'failed'; message: string }

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
  /**
   * Save the open file, or undefined where this surface cannot write.
   * @returns the version token the write produced.
   */
  write?: ((root: string, path: string, text: string, version: string) => Promise<string>) | undefined
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

export function FileBrowser({ root, path, list, read, write, onOpen, onOpenExternally, t }: FileBrowserProps) {
  const [filter, setFilter] = useState('')
  // The tree is the way to the next file, so it stays open by default; a
  // reader who wants the code wide can put it away and it stays away.
  const [treeOpen, setTreeOpen] = useState(true)
  const [content, setContent] = useState<Content | undefined>(undefined)
  // The buffer is separate from what was read: `draft` is what the person has
  // typed, and the read's own text is what a save is measured against.
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [save, setSave] = useState<SaveState>({ status: 'clean' })
  const controller = useRef<AbortController>(new AbortController())

  useEffect(() => {
    if (path === undefined) { setContent(undefined); return }
    const live = new AbortController()
    setContent({ status: 'loading' })
    read(root, path, live.signal).then(
      (file) => {
        if (live.signal.aborted) return
        setContent({ status: 'ready', file })
        // A fresh read is a fresh buffer: keeping the old draft would show
        // one file's edits over another file's content.
        setDraft(file.text)
        setSave({ status: 'clean' })
      },
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

  /**
   * Send the buffer back, guarded by the version the read returned.
   *
   * A refused guard is not an error to swallow: it means someone else — an
   * agent in the same tree, most often — changed the file, and the person is
   * about to overwrite work they cannot see. It stops there and offers the
   * re-read, because this surface cannot merge and the alternative loses one
   * side silently.
   */
  const commit = (): void => {
    if (write === undefined || path === undefined) return
    const file = content?.status === 'ready' ? content.file : undefined
    if (file?.version === undefined || draft === undefined) return
    setSave({ status: 'saving' })
    write(root, path, draft, file.version).then(
      (version) => {
        setContent({ status: 'ready', file: { ...file, text: draft, version } })
        setSave({ status: 'clean' })
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setSave(message.includes('workspace-file-stale')
          ? { status: 'stale' }
          : { status: 'failed', message })
      },
    )
  }

  /** Take what is on disk now, discarding the buffer. */
  const reread = (): void => {
    if (path === undefined) return
    setSave({ status: 'clean' })
    setContent({ status: 'loading' })
    read(root, path, controller.current.signal).then(
      (file) => { setContent({ status: 'ready', file }); setDraft(file.text) },
      (error: unknown) => {
        setContent({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
      },
    )
  }

  const ready = content?.status === 'ready' ? content.file : undefined
  // Editable exactly when there is something to edit and somewhere to put it:
  // the Host composes a write, the file came back with text, and it carries
  // the version a guarded save needs.
  const editable = write !== undefined && ready?.text !== undefined && ready.version !== undefined
  const shown = editable ? draft ?? '' : ready?.text ?? ''
  const lines = content?.status === 'ready' ? shown.split('\n') : []
  // The highlighter's alias table accepts file extensions directly (`ts`,
  // `py`, `rs`, …), so the extension IS the language hint — no second
  // extension-to-language table to drift from the read tool's.
  const extension = path === undefined ? undefined : /\.([A-Za-z0-9]+)$/u.exec(path)?.[1]?.toLowerCase()
  // A lazily-loaded grammar arrives after the first render; the count changing
  // is what re-tokenizes a file that showed plain while its language loaded.
  const grammars = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const highlighted = useMemo(
    () => (content?.status === 'ready' && content.file.text !== undefined
      ? highlightLines(shown, extension)
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
                      : editable
                        ? (
                          <div className={css.editor}>
                            {/* One layer, not two. A highlighted view under a
                                transparent textarea has to keep two boxes in
                                exact metric agreement through every wrap and
                                every font fallback; when they drift, the
                                caret sits on the wrong character and nothing
                                tells the person why. Plain text always
                                agrees with itself. */}
                            <textarea
                              className={css.editorArea}
                              value={shown}
                              spellCheck={false}
                              aria-label={fileName(path)}
                              onChange={(event) => {
                                setDraft(event.target.value)
                                setSave(event.target.value === ready.text ? { status: 'clean' } : { status: 'dirty' })
                              }}
                              onKeyDown={(event) => {
                                // The save gesture every editor has. Without
                                // it the button is the only way, and a person
                                // typing will press this anyway.
                                if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                                  event.preventDefault()
                                  commit()
                                }
                              }}
                            />
                            <div className={css.saveBar} data-state={save.status}>
                              <span className={css.saveNote}>
                                {save.status === 'stale' ? t('files.stale')
                                  : save.status === 'failed' ? t('files.saveFailed')
                                    : save.status === 'saving' ? t('files.saving')
                                      : save.status === 'dirty' ? t('files.unsaved')
                                        : ''}
                              </span>
                              {save.status === 'stale' && (
                                <button type="button" className={css.saveAction} onClick={() => { reread() }}>
                                  {t('files.reread')}
                                </button>
                              )}
                              <button
                                type="button" className={css.saveAction}
                                disabled={save.status !== 'dirty'}
                                onClick={() => { commit() }}
                              >
                                {t('files.save')}
                              </button>
                            </div>
                          </div>
                        )
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
