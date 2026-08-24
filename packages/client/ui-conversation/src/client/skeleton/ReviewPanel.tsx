/**
 * The Review tab: everything this session changed, in one place.
 *
 * Each file is a card — path, the size of its change, and the applied diff.
 * The diff itself is drawn by the same primitive the transcript's tool rows
 * use, from the same derivation, so a change cannot read one way in the flow
 * and another way here.
 *
 * The cap is the primitive's own default rather than the transcript's tighter
 * one: a row inside the message flow must stay scannable past twenty of them,
 * while this surface exists to be read.
 */

import { useState } from 'react'
import { DiffBlock } from '@unieai/uad-client-ui-primitives'
import type { DetailsSlotProps } from '../contract/slots.ts'
import { fileName } from './artifacts.ts'
import type { ReviewedFile, ReviewSummary } from './review.ts'
import css from './ReviewPanel.module.css'

/** What the Review tab renders. */
export interface ReviewPanelProps {
  /** The session's changes, already derived. */
  review: ReviewSummary
  /** Hand one file to whatever this surface uses to show a file. */
  onOpen?: ((path: string) => void) | undefined
  /**
   * Select the call that made this change, which puts the transcript on it.
   *
   * The artifact list used to be the way to reach a mutation's own call; this
   * carries that over, so removing that list took nothing with it.
   */
  onSelect: (file: ReviewedFile) => void
  /** Feature copy. */
  t: DetailsSlotProps['t']
}

/**
 * Show every file the session changed.
 * @param props - the review, an optional open action, and copy.
 * @returns the review surface.
 */
export function ReviewPanel({ review, onOpen, onSelect, t }: ReviewPanelProps) {
  // Collapsed by default would hide the answer this tab exists to give; the
  // per-file toggle is for putting a finished file away, not for finding one.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())

  if (review.files.length === 0) {
    return <div className={css.empty}>{t('review.empty')}</div>
  }

  return (
    <div className={css.root}>
      <div className={css.summary}>
        <span className={css.count}>
          {t('review.files', { count: String(review.files.length) })}
        </span>
        <span className={css.added}>{`+${String(review.total.added)}`}</span>
        <span className={css.removed}>{`-${String(review.total.removed)}`}</span>
      </div>
      {review.files.map((file) => {
        const open = !folded.has(file.path)
        return (
          <section key={file.path} className={css.file} data-failed={file.failed || undefined}>
            <header className={css.head}>
              <button
                type="button" className={css.fold} aria-expanded={open}
                onClick={() => {
                  setFolded((current) => {
                    const next = new Set(current)
                    if (!next.delete(file.path)) next.add(file.path)
                    return next
                  })
                }}
              >
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden data-open={open || undefined}>
                  <path d="M4 2.5 8 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {onOpen === undefined
                ? <span className={css.name} title={file.path}>{fileName(file.path)}</span>
                : (
                  <button
                    type="button" className={css.name} title={file.path}
                    onClick={() => { onOpen(file.path) }}
                  >
                    {fileName(file.path)}
                  </button>
                )}
              {file.touches > 1 && (
                <span className={css.touches}>
                  {t('review.touches', { count: String(file.touches) })}
                </span>
              )}
              <button
                type="button" className={css.stats} title={t('review.reveal')}
                onClick={() => { onSelect(file) }}
              >
                <span className={css.added}>{`+${String(file.stats.added)}`}</span>
                <span className={css.removed}>{`-${String(file.stats.removed)}`}</span>
              </button>
            </header>
            {open && <DiffBlock diffs={file.diffs} className={css.diff} />}
          </section>
        )
      })}
    </div>
  )
}
