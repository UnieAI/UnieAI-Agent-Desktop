// DiffBlock: the inline-diff surface for a file mutation (write/edit) — a copy
// control over one or more per-file hunks, each a path header followed by the
// change itself, with a dim `└ +A -R · N file(s)` footer.
//
// The change is a REAL line diff, not the two sides printed one after the
// other. It used to be the latter, which meant an edit that touched one line
// of a fifty-line region drew fifty red lines and fifty green ones and left
// the reader to spot the difference — and counted `+50 -50` while doing it.
// `structuredPatch` (the `diff` package, already used by tool-fs and
// ui-trajectory) produces the hunks; unchanged lines stay as context, changed
// ones carry the sides, and every row states its old and new line numbers. The
// counts are of changed lines only, which is what `+A -R` means everywhere
// else a person has read one.
// Output never soft-wraps — an aligned source line keeps its indentation and
// scrolls horizontally instead of folding. Colors resolve through --dsw-*
// tokens; geometry mirrors CodeBlock. A render site inside a bounded flow caps
// the body by binding --dsl-diff-body-max-height, which leaves the copy control
// and the footer counts in place while the diff lines scroll.

import { useCallback, useMemo, useState } from 'react'
import clsx from 'clsx'
import { structuredPatch } from 'diff'
import { writeClipboard } from './clipboard.ts'
import css from './DiffBlock.module.css'

/**
 * Output lines shown before the height cap collapses the middle. Matches
 * {@link DEFAULT_TERMINAL_MAX_LINES} so a diff card and a terminal card cut a
 * long body at the same place.
 */
export const DEFAULT_DIFF_MAX_LINES = 16

/**
 * One file's change, in the shape {@link DiffBlock} draws. Structurally the
 * render-intent contract's `FileDiff`, redeclared here so this primitive stays
 * free of the tool contract (the terminal card's decoupling, applied to diffs).
 */
export interface DiffHunk {
  /** The changed file's path, drawn verbatim as the hunk's header (the tool's model-facing path). */
  path: string
  /** Prior content, or `null` for a new file / an overwrite (nothing on the removed side). */
  oldText: string | null
  /** Content after the change (the added side). */
  newText: string
}

export interface DiffBlockProps {
  /** One entry per applied hunk, in file order; empty renders nothing. */
  diffs: DiffHunk[]
  /** Height cap in body lines before the middle collapses (default {@link DEFAULT_DIFF_MAX_LINES}). */
  maxLines?: number | undefined
  /** Extra class merged onto the wrapper (callers position; this component draws). */
  className?: string | undefined
}

/**
 * A single rendered body line and its role, so the height cap slices a flat
 * list. `hunk` is the `@@` separator between discontiguous regions of one
 * file; `path` opens a file. Both carry no line numbers, which is what tells
 * the renderer to draw them as chrome rather than as source.
 */
interface DiffRow {
  kind: 'path' | 'hunk' | 'context' | 'del' | 'add'
  text: string
  /** Line number on the old side, absent for an inserted or chrome row. */
  oldNo?: number
  /** Line number on the new side, absent for a removed or chrome row. */
  newNo?: number
}

/** Change totals of a hunk list, as {@link DiffBlock}'s footer states them. */
export interface DiffStats {
  /** Total new-side lines across every hunk. */
  added: number
  /** Total old-side lines across every hunk; a create contributes none. */
  removed: number
  /** DISTINCT paths touched, so two hunks in one file count as one. */
  files: number
}

/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value: never): never {
  throw new Error(`unreachable diff row kind: ${String(value)}`)
}

/** The class per row kind (path/hunk chrome vs the diff's own +/- tinting). */
const ROW_CLASS: Record<DiffRow['kind'], string | undefined> = {
  path: css.path,
  hunk: css.hunk,
  context: css.context,
  del: css.del,
  add: css.add,
}

/**
 * Unchanged lines kept either side of a change.
 *
 * Three is what `git diff` and every review surface built on it show, so a
 * reader arrives already knowing how much surrounding code they are being
 * given.
 */
const DIFF_CONTEXT = 3

/**
 * Count what a hunk list changes, from the same rows the body draws, so a
 * caller that states the totals outside this card — the chat tool row's
 * collapsed summary — never counts them a second way. Only CHANGED lines
 * count: an edit that rewrote one line of a fifty-line region is `+1 -1`, not
 * `+50 -50`.
 * The file count is of DISTINCT paths, matching the TUI diff card's footer, so
 * two hunks in one file read as `1 file` on both front ends.
 * @param diffs - the hunks to count.
 * @returns the added/removed line totals and the distinct-file count.
 */
export function diffStats(diffs: DiffHunk[]): DiffStats {
  const paths = new Set<string>()
  let added = 0
  let removed = 0
  for (const diff of diffs) {
    paths.add(diff.path)
    for (const row of hunkRows(diff)) {
      if (row.kind === 'add') added += 1
      else if (row.kind === 'del') removed += 1
    }
  }
  return { added, removed, files: paths.size }
}

/**
 * End a side with a newline, so a comparison is of lines rather than of line
 * terminators.
 * @param text - the removed or added side's text.
 * @returns the same text, newline-terminated; empty text stays empty.
 */
function terminated(text: string): string {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`
}

/**
 * The rows of ONE hunk's change, without its path header.
 *
 * A create (`oldText === null`) has no old side to compare against, so every
 * line is an insertion and `structuredPatch` would spend the work to tell us
 * so. Everything else goes through the real diff, which is what keeps the
 * unchanged lines as context instead of drawing them twice in two colours.
 * @param diff - one file's change.
 * @returns the body rows for it, in draw order.
 */
function hunkRows(diff: DiffHunk): DiffRow[] {
  if (diff.oldText === null) {
    return contentLines(diff.newText).map((text, index) => ({
      kind: 'add' as const, text, newNo: index + 1,
    }))
  }
  // Both sides are terminated before comparing. jsdiff treats a final line
  // with no newline as different from the same text with one, so an append to
  // a file whose last line was unterminated reported that untouched last line
  // as removed AND added. This block's own line rule already reads a trailing
  // newline as a terminator rather than an extra line, so terminating both
  // sides is what makes the comparison agree with what the card draws.
  const patch = structuredPatch('', '', terminated(diff.oldText), terminated(diff.newText), undefined, undefined, {
    context: DIFF_CONTEXT,
  })
  const rows: DiffRow[] = []
  for (const hunk of patch.hunks) {
    rows.push({
      kind: 'hunk',
      text: `@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@`,
    })
    let oldNo = hunk.oldStart
    let newNo = hunk.newStart
    for (const line of hunk.lines) {
      // `\ No newline at end of file` is a note about the previous line, not a
      // line of the file; drawing it would put a row in the gutter that has no
      // number on either side.
      if (line.startsWith('\\')) continue
      const text = line.slice(1)
      if (line.startsWith('+')) rows.push({ kind: 'add', text, newNo: newNo++ })
      else if (line.startsWith('-')) rows.push({ kind: 'del', text, oldNo: oldNo++ })
      else rows.push({ kind: 'context', text, oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return rows
}

/**
 * Flatten the hunks into the body's rows. A path header opens each new file; a
 * same-file second hunk repeats no path, because its own `@@` line already
 * says where in the file it lands.
 * @param diffs - the hunks to render.
 * @returns the body rows in draw order.
 */
function buildRows(diffs: DiffHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  let prevPath: string | undefined
  for (const diff of diffs) {
    if (diff.path !== prevPath) rows.push({ kind: 'path', text: diff.path })
    prevPath = diff.path
    rows.push(...hunkRows(diff))
  }
  return rows
}

/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side draws nothing), and a
 * single trailing newline is a line terminator rather than an extra empty line —
 * the same terminator rule TerminalBlock applies to command output. An interior
 * blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * The diff text a reader copies: unified-diff prefixes and the content,
 * exactly what the card shows. The prefixes are the unpadded `-`/`+`/space of
 * a real patch, so what comes off the clipboard reads as one — and the path
 * headers keep a multi-file copy attributable.
 * @param rows - the flattened body rows.
 * @returns the diff as plain text.
 */
function copyText(rows: DiffRow[]): string {
  return rows.map((row) => {
    switch (row.kind) {
      case 'del': return `-${row.text}`
      case 'add': return `+${row.text}`
      case 'context': return ` ${row.text}`
      case 'path': return row.text
      case 'hunk': return row.text
      /* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
      default: return assertNever(row.kind)
    }
  }).join('\n')
}

/**
 * One body row: two line-number gutters and the source.
 *
 * The numbers are what turn a coloured line into a place in a file — without
 * them a reader can see THAT something changed and not WHERE. A row that
 * exists on one side only leaves the other gutter blank rather than repeating
 * a neighbour's number, which is how every review surface draws it.
 *
 * The gutters are `aria-hidden`: a screen reader reading a diff wants the
 * line, not two numbers in front of every one of them, and the row's own
 * marker already carries whether it was added or removed.
 * @param props - the row to draw.
 * @returns the row element.
 */
function Row({ row }: { row: DiffRow }) {
  const chrome = row.kind === 'path' || row.kind === 'hunk'
  return (
    <div className={clsx(css.line, ROW_CLASS[row.kind])}>
      {!chrome && (
        <>
          <span className={css.gutter} aria-hidden>{row.oldNo ?? ''}</span>
          <span className={css.gutter} aria-hidden>{row.newNo ?? ''}</span>
          <span className={css.marker} aria-hidden>
            {row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}
          </span>
        </>
      )}
      <span className={css.text}>{row.text === '' ? ' ' : row.text}</span>
    </div>
  )
}

/**
 * Render a file mutation as an inline diff surface.
 * @param props - see {@link DiffBlockProps}.
 * @returns the diff block element.
 */
export function DiffBlock({ diffs, maxLines = DEFAULT_DIFF_MAX_LINES, className }: DiffBlockProps) {
  const rows = useMemo(() => buildRows(diffs), [diffs])
  const { added, removed, files } = useMemo(() => diffStats(diffs), [diffs])
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(copyText(rows)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1000)
    })
  }, [copied, rows])

  const onToggle = useCallback(() => { setExpanded(value => !value) }, [])

  if (rows.length === 0) return null

  const hidden = rows.length - maxLines
  const capped = hidden > 0 && !expanded
  // Same split arithmetic as TerminalBlock and the TUI transcript's collapsed
  // card, so a body's head and tail slices agree across the front ends.
  const headLines = Math.ceil(maxLines / 2)
  const tailLines = maxLines - headLines
  const head = capped ? rows.slice(0, headLines) : rows
  const tail = capped ? rows.slice(rows.length - tailLines) : []

  return (
    <div className={clsx(css.block, className)} data-diff="">
      <button type="button" className={css.copyButton} onClick={onCopy}>
        {copied ? '复制成功' : '复制'}
      </button>
      <div className={css.body}>
        {head.map((row, index) => <Row key={index} row={row} />)}
        {hidden > 0 && (
          <button
            type="button"
            className={css.expand}
            aria-expanded={expanded}
            aria-label={expanded ? '收起差异' : `展开其余 ${hidden} 行差异`}
            onClick={onToggle}
          >
            {expanded ? '收起' : `… 其余 ${hidden} 行`}
          </button>
        )}
        {tail.map((row, index) => <Row key={index} row={row} />)}
      </div>
      <div className={css.footer}>└ +{added} -{removed} · {files} file{files === 1 ? '' : 's'}</div>
    </div>
  )
}
