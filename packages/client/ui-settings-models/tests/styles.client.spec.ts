/**
 * Models section stylesheet contract, asserted against the CSS text on disk.
 *
 * The section paints in both themes, and a `--dsw-*` name the theme does not
 * declare fails silently: the browser takes the `var()` fallback, so the sheet
 * still renders and only the dark theme looks wrong. Checking the names against
 * the sheet that declares them is what turns that into a test failure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/ModelsSection.module.css', import.meta.url)), 'utf8')
// The theme package maps `./styles/*` to `./src/styles/*`, so the declarations
// stay on the source plane rather than needing a build.
// Every theme sheet, not just the platform tokens: font and scrollbar
// variables are declared in siblings, and a gate reading one file would call
// their names undeclared.
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

/** The declarations of one top-level rule, by selector. */
function block(selector: string): string {
  const match = new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(css)
  if (match === null) throw new Error(`ModelsSection.module.css has no \`${selector}\` rule`)
  return match[1] ?? ''
}

describe('ModelsSection theme styles', () => {
  it('names only theme variables the token sheet defines', () => {
    // A `--dsw-*` name the sheet never declares is not a near miss: it silently
    // resolves to whatever literal sits in its fallback slot, which is how this
    // section stayed light under the dark theme before. Undeclared names have
    // no fallback at all and inherit, so both spellings must fail here.
    // Every theme-variable prefix the sheets actually use, not just `--dsw-`:
    // a `--dsh-` name reads as a plausible sibling and would otherwise slip
    // past this gate into a fallback literal.
    const named = [...css.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
    expect(css).not.toMatch(/var\(--(?:surface|text-|border|accent-strong)/)
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    // A missing `}` on an `@media` block is not a parse error: every rule after
    // it silently becomes conditional, and the whole fetch dialog once painted
    // unstyled for anyone whose system does not ask for reduced motion. Nothing
    // downstream reports this — the sheet loads and the classes still attach.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })

  it('draws a provider as a row, not as a box holding another box', () => {
    // The row used to be an outlined, rounded box and the editor it expands
    // into a filled one, so an open provider was a box drawn inside a box and
    // every closed provider carried an edge the list itself already implies.
    // The row is a hairline entry now, and the editor draws nothing at all: the
    // fields carry their own edges, which is the whole structure the form
    // needs. A card on this page is the ADD form alone — a form belonging to
    // nothing above it, so it needs its own bounds.
    expect(block('.rows')).toContain('border-top: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.rowCard')).toContain('border-bottom: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.rowCard')).not.toMatch(/border-radius|\bbackground\s*:/)
    expect(block('.editor')).not.toMatch(/\bborder|\bbackground\s*:/)
    expect(block('.addCard')).toContain('border-radius: var(--dsw-radius-card)')
  })

  it('fills with bg-module-platform, never a bg-layer step', () => {
    // bg-layer-1/2/3 all resolve to the same white in the light palette, so a
    // surface painted with one is invisible there and only separates under the
    // dark theme. Fills go through bg-module-platform; separation is the
    // hairline.
    expect(css).not.toContain('--dsw-alias-bg-layer')
    expect(block('.input')).toContain('background: var(--dsw-alias-bg-module-platform)')
  })

  it('takes every radius from the shared scale', () => {
    // The scale carries four values (`control` 8, `card` 16, `bubble` 24,
    // `pill`). This sheet used to spell 12, 6 and 4 by hand, which are values
    // no theme change can reach.
    const radii = [...css.matchAll(/border-radius:([^;]*);/g)].map(match => (match[1] ?? '').trim())
    expect(radii.length).toBeGreaterThan(0)
    for (const value of radii) {
      for (const part of value.split(/\s+(?=var\()|\s+(?=0)/)) {
        expect(part, value).toMatch(/^(?:var\(--dsw-radius-[a-z]+\)|0)$/)
      }
    }
  })

  it('gives every dropdown the shared chevron instead of the OS arrow', () => {
    // `select.input` caps the control at 240px, and the OS arrow is painted
    // flush inside that shrunk right edge — visibly tighter than every other
    // control on the page. `.selectInput` is what removes it, reserves the
    // right pad, and paints the shared chevron; a `<select>` that takes
    // `.input` alone silently keeps the OS one.
    const sources = readdirSync(fileURLToPath(new URL('../src/client/', import.meta.url)))
      .filter(name => name.endsWith('.tsx'))
      .map(name => ({
        name,
        text: readFileSync(fileURLToPath(new URL(`../src/client/${name}`, import.meta.url)), 'utf8'),
      }))
    const bare = sources.flatMap(({ name, text }) => text
      .split('<select')
      .slice(1)
      // The element's own attributes end at the first `>`; a child `<option>`
      // carries no className of its own and must not answer for the select.
      .map(rest => rest.slice(0, rest.indexOf('>')))
      .filter(attributes => !attributes.includes('selectInput'))
      .map(() => name))
    expect(bare).toEqual([])
  })

  it('never falls back to a literal colour', () => {
    // A token that resolves is never the problem; an undeclared one takes this
    // branch, and a literal here is a single colour for both themes.
    expect(css).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
  })
})
