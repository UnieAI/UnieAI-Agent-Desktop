/**
 * The editing surface for a workspace file: one CodeMirror view, editable
 * from the moment a file opens.
 *
 * WHY A REAL EDITOR. A `<textarea>` is a text box, not a place to write code:
 * no highlighting, no undo that understands edits, no bracket matching, no
 * indent. This surface is where someone changes a file the agent is also
 * working in, so it has to behave the way every other editor they use does —
 * including Cmd/Ctrl+S.
 *
 * WHY NOT THE READ VIEW'S HIGHLIGHTER. `ui-primitives`' shiki highlighter
 * tokenizes a whole document synchronously, which is right for a card that
 * renders once and never changes. An editor re-tokenizes on every keystroke,
 * and whole-document work per key is O(file) per key — a 4000-line file would
 * stutter under typing. CodeMirror's parser is incremental: it re-parses the
 * edited range. So there are two tokenizers here, deliberately, for two
 * different jobs.
 *
 * There is only ONE PALETTE, though. The highlight style below maps
 * CodeMirror's tags onto the same `--shiki-token-*` custom properties the read
 * view resolves its colors through, so a keyword is the same colour in the
 * card and in the editor, in both themes, and neither this file nor the
 * theme's sheets hold a second set of colours.
 */

import { useEffect, useRef } from 'react'
import { closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching, defaultHighlightStyle, HighlightStyle, indentOnInput, syntaxHighlighting,
} from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import {
  drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { cpp } from '@codemirror/lang-cpp'
import { css as cssLang } from '@codemirror/lang-css'
import { go } from '@codemirror/lang-go'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'

/** What this editor needs to show one file and hand its edits back. */
export interface CodeEditorProps {
  /** The text on screen. A change from outside — a re-read — replaces the buffer. */
  value: string
  /** The open file, for the language only; a change re-parses under a new grammar. */
  path: string
  /** Whether the buffer accepts edits at all. */
  readOnly: boolean
  /** Called with the whole document after each edit the person makes. */
  onChange: (text: string) => void
  /** The save gesture (Cmd/Ctrl+S), which the browser must not take instead. */
  onSave: () => void
  /** Accessible name, since the editor is a bare region without one. */
  label: string
}

/**
 * The grammar for one file extension.
 *
 * Imported statically, unlike the read card's shiki grammars, because a
 * client plugin is loaded through the harness's module table: a bare
 * specifier stays external and resolves there, while a dynamic import
 * becomes a relative chunk the table has no row for — the app then fails to
 * load this package at all. Every grammar therefore ships in the bundle.
 *
 * The set is the parsers published as their own package entry points. Shell,
 * TOML and Dockerfile live in `@codemirror/legacy-modes` behind per-mode
 * subpaths, which the bundler emits as relative chunks for the same reason —
 * so they are absent, and a shell script is editable, monochrome text. An
 * extension with no entry gets no grammar and stays perfectly editable:
 * plain text is the honest rendering of a language nothing here can parse.
 */
const GRAMMARS = new Map<string, () => Extension>([
  ['ts', () => javascript({ typescript: true })],
  ['tsx', () => javascript({ typescript: true, jsx: true })],
  ['js', () => javascript({})],
  ['jsx', () => javascript({ jsx: true })],
  ['py', () => python()],
  ['md', () => markdown()],
  ['json', () => json()],
  ['yaml', () => yaml()],
  ['css', () => cssLang()],
  ['html', () => html()],
  ['rs', () => rust()],
  ['go', () => go()],
  ['sql', () => sql()],
  ['cpp', () => cpp()],
  ['java', () => java()],
  ['xml', () => xml()],
  ['php', () => php()],
])

/**
 * Extensions that are the same language under another name.
 *
 * Spelled as aliases rather than as extra map entries so each grammar has
 * exactly one entry, and the table stays readable as a list of languages
 * rather than a list of file endings.
 */
const ALIASES = new Map<string, string>([
  ['mts', 'ts'], ['cts', 'ts'], ['mjs', 'js'], ['cjs', 'js'],
  ['pyi', 'py'], ['markdown', 'md'], ['jsonc', 'json'], ['yml', 'yaml'],
  ['scss', 'css'], ['less', 'css'], ['htm', 'html'],
  ['c', 'cpp'], ['h', 'cpp'], ['cc', 'cpp'], ['hpp', 'cpp'],
  ['svg', 'xml'],
])

/**
 * The grammar for one file extension.
 * @param extension - lower-case extension, without the dot.
 * @returns the language extension, or undefined where nothing here parses it.
 */
export function grammarFor(extension: string | undefined): Extension | undefined {
  if (extension === undefined) return undefined
  return GRAMMARS.get(ALIASES.get(extension) ?? extension)?.()
}

/**
 * The read view's palette, as CodeMirror tags.
 *
 * Every colour is a `--shiki-token-*` custom property the theme package
 * declares for both themes; nothing here names a colour. A tag with no entry
 * falls through to the foreground, which is what the read view does with a
 * token its theme does not colour.
 */
const PALETTE = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--shiki-token-comment)', fontStyle: 'italic' },
  { tag: tags.lineComment, color: 'var(--shiki-token-comment)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--shiki-token-comment)', fontStyle: 'italic' },
  { tag: tags.docComment, color: 'var(--shiki-token-comment)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--shiki-token-keyword)' },
  { tag: tags.modifier, color: 'var(--shiki-token-keyword)' },
  { tag: tags.controlKeyword, color: 'var(--shiki-token-keyword)' },
  { tag: tags.operatorKeyword, color: 'var(--shiki-token-keyword)' },
  { tag: tags.definitionKeyword, color: 'var(--shiki-token-keyword)' },
  { tag: tags.moduleKeyword, color: 'var(--shiki-token-keyword)' },
  { tag: tags.self, color: 'var(--shiki-token-keyword)' },
  { tag: tags.string, color: 'var(--shiki-token-string)' },
  { tag: tags.special(tags.string), color: 'var(--shiki-token-string-expression)' },
  { tag: tags.regexp, color: 'var(--shiki-token-string-expression)' },
  { tag: tags.number, color: 'var(--shiki-token-constant)' },
  { tag: tags.bool, color: 'var(--shiki-token-constant)' },
  { tag: tags.null, color: 'var(--shiki-token-constant)' },
  { tag: tags.atom, color: 'var(--shiki-token-constant)' },
  { tag: tags.function(tags.variableName), color: 'var(--shiki-token-function)' },
  { tag: tags.function(tags.propertyName), color: 'var(--shiki-token-function)' },
  { tag: tags.definition(tags.function(tags.variableName)), color: 'var(--shiki-token-function)' },
  { tag: tags.propertyName, color: 'var(--shiki-token-parameter)' },
  { tag: tags.attributeName, color: 'var(--shiki-token-parameter)' },
  { tag: tags.typeName, color: 'var(--shiki-token-function)' },
  { tag: tags.className, color: 'var(--shiki-token-function)' },
  { tag: tags.namespace, color: 'var(--shiki-token-function)' },
  { tag: tags.tagName, color: 'var(--shiki-token-keyword)' },
  { tag: tags.punctuation, color: 'var(--shiki-token-punctuation)' },
  { tag: tags.bracket, color: 'var(--shiki-token-punctuation)' },
  { tag: tags.operator, color: 'var(--shiki-token-punctuation)' },
  { tag: tags.link, color: 'var(--shiki-token-link)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--shiki-token-link)' },
  { tag: tags.heading, color: 'var(--shiki-token-keyword)', fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
])

/**
 * The chrome around the text: also tokens only.
 *
 * The editor sits inside a panel the app already paints, so its own
 * background is transparent rather than a second surface colour, and the
 * gutter matches the read view's line numbers.
 */
const THEME = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--shiki-foreground, var(--dsw-alias-label-primary))',
  },
  '&.cm-focused': { outline: 'none' },
  // The read view's own metrics, so switching between reading and editing
  // does not move a single line under the reader's eye.
  '.cm-scroller': {
    fontFamily: 'var(--ds-font-family-code)',
    fontSize: '12px',
    lineHeight: '20px',
  },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--dsw-alias-label-tertiary)',
    paddingRight: '12px',
    paddingLeft: '2px',
  },
  '.cm-lineNumbers .cm-gutterElement': { fontVariantNumeric: 'tabular-nums' },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--dsw-alias-bg-module-platform)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dsw-alias-label-primary)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--dsw-alias-interactive-bg-hover)',
    outline: 'none',
  },
})

/**
 * A file, open for editing.
 *
 * The view is created once and kept: rebuilding it on every render would
 * discard the selection, the scroll position and the undo history — the three
 * things a person notices immediately. Everything that can change afterwards
 * moves through a transaction or a compartment instead.
 * @param props - see {@link CodeEditorProps}.
 * @returns the host element the view mounts into.
 */
export function CodeEditor({ value, path, readOnly, onChange, onSave, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const language = useRef(new Compartment())
  const editable = useRef(new Compartment())
  // The callbacks are read through refs so the view's extensions never need
  // rebuilding when a parent re-renders with new closures.
  const latest = useRef({ onChange, onSave })
  latest.current = { onChange, onSave }

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const extension = /\.([A-Za-z0-9]+)$/u.exec(path)?.[1]?.toLowerCase()
    const created = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(PALETTE),
          // The fallback keeps a tag this palette does not name from
          // rendering as body text in the middle of code.
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          THEME,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          keymap.of([
            {
              // Before the default keymap, so nothing else claims it, and
              // preventing the browser's own Save-page dialog.
              key: 'Mod-s',
              preventDefault: true,
              run: () => { latest.current.onSave(); return true },
            },
            ...defaultKeymap,
            ...historyKeymap,
            // Tab indents, as it does in the editor beside this one. The
            // escape hatch CodeMirror documents still works: Escape then Tab
            // leaves the editor, so a keyboard user is not trapped.
            indentWithTab,
          ]),
          language.current.of(grammarFor(extension) ?? []),
          editable.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = created
    return () => { created.destroy(); view.current = null }
    // Built once per open file. `value` is deliberately absent: later text
    // arrives as a transaction below, which keeps the history and the caret.
  }, [path])

  useEffect(() => {
    const current = view.current
    if (current === null) return
    const shown = current.state.doc.toString()
    // Only a genuine difference is dispatched. Echoing every keystroke back
    // through this effect would replace the document the person is typing in
    // and put the caret at the end of it.
    if (shown === value) return
    current.dispatch({ changes: { from: 0, to: shown.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(readOnly)) })
  }, [readOnly])

  return <div ref={host} data-code-editor style={{ height: '100%', minHeight: 0, overflow: 'hidden' }} />
}
