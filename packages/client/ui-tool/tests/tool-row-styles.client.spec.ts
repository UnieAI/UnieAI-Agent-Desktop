/**
 * The layout contract of the ToolRow summary line and its expanded diff card,
 * as CSS text. jsdom has no layout, so the rendering specs (chat-tool-row.spec.tsx,
 * transcript-diff.client.spec.tsx) can pin which spans and rows exist but not
 * whether a narrow row still fits on one line or whether a long diff stays
 * inside its own scroller; these read the declarations the layout depends on.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sheet = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
  // Declarations only: each sheet's prose names the properties it explains.
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

const toolRowCss = sheet('../src/client/tool/components/ToolRow.module.css')
/** The chat row binds a cap the primitive's own sheet has to honour. */
const diffBlockCss = sheet('../../ui-primitives/src/DiffBlock.module.css')

function declarationsIn(text: string, selector: string): string[] {
  // Anchored at a rule boundary: an unanchored match would silently read a
  // compound rule that merely contains the selector (`.root:hover .summarySuffix`)
  // if one ever lands above the base rule.
  const rule = new RegExp(`(?:^|\\})\\s*\\${selector}\\s*\\{([^{}]*)\\}`).exec(text)
  if (rule === null) throw new Error(`no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

const declarations = (selector: string) => declarationsIn(toolRowCss, selector)

describe('ToolRow.module.css summary line', () => {
  it('keeps the summary suffix on one line and unshrunk', () => {
    // `flex: none` stops the box shrinking, not the text wrapping: without
    // `nowrap`, a row too narrow for title + separator + suffix wraps the `+n`
    // onto a second line — the exact case the slot exists to survive.
    expect(declarations('.summarySuffix')).toEqual(expect.arrayContaining([
      'flex: none',
      'white-space: nowrap',
    ]))
  })

  it('leaves the truncation to the summary text alone', () => {
    // The suffix must never ellipsize: a clipped count reads as a smaller
    // number rather than as missing information.
    expect(declarations('.summary')).toEqual(expect.arrayContaining([
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
    ]))
    expect(declarations('.summarySuffix')).not.toEqual(expect.arrayContaining(['text-overflow: ellipsis']))
  })
})

describe('expanded diff card in the message flow', () => {
  it('caps the expanded diff so a long one scrolls instead of taking the flow', () => {
    // The row caps the card at CHAT_DIFF_MAX_LINES, but the card's own
    // "show the rest" control lifts that cap; without the bound, a thousand-line
    // diff would push the rest of the conversation off screen.
    expect(declarations('.diffBody')).toEqual(expect.arrayContaining([
      '--dsl-diff-body-max-height: 224px',
    ]))
    expect(declarationsIn(diffBlockCss, '.body')).toEqual(expect.arrayContaining([
      'max-height: var(--dsl-diff-body-max-height, none)',
      'overflow-y: auto',
    ]))
  })

  it('scrolls a wide diff line inside the card, never the transcript', () => {
    // An unwrapped source line keeps its indentation, so the card owns the
    // horizontal scroller; the conversation column must not grow with it.
    expect(declarationsIn(diffBlockCss, '.body')).toEqual(expect.arrayContaining(['overflow-x: auto']))
    expect(declarationsIn(diffBlockCss, '.line')).toEqual(expect.arrayContaining(['white-space: pre']))
  })
})
