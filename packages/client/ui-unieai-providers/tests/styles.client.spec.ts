/**
 * API Provider stylesheet contract, asserted against the CSS text on disk.
 *
 * A `--dsw-*` name the theme does not declare fails silently: the browser
 * takes the `var()` fallback, so the sheet still renders and only one palette
 * looks wrong. Checking the names against the sheets that declare them is what
 * turns that into a test failure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/ProvidersSection.module.css', import.meta.url)),
  'utf8',
)
// Every theme sheet, not just the platform tokens: radius, type, and font
// variables are declared in siblings, and a gate reading one file would call
// their names undeclared.
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

/** The declarations of one top-level rule, by selector. */
function block(selector: string): string {
  const match = new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(css)
  if (match === null) throw new Error(`ProvidersSection.module.css has no \`${selector}\` rule`)
  return match[1] ?? ''
}

describe('ProvidersSection theme styles', () => {
  it('names only theme variables the token sheets define', () => {
    const named = [...css.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
  })

  it('writes no literal colour at all', () => {
    // Feature CSS resolves every colour through a semantic alias
    // (docs/web-styling.md); a hex or rgb() here would be one value for both
    // palettes. `#` also catches an id selector, which this sheet never uses.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('never falls back to a literal colour', () => {
    expect(css).not.toMatch(/var\(--dsw?-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
  })

  it('keeps the brand hue out: this screen has no second blue', () => {
    expect(css).not.toContain('--dsw-static-deepseek')
    expect(css).not.toContain('--dsw-alias-brand')
  })

  it('fills with bg-module-platform, never a bg-layer step', () => {
    // bg-layer-1/2/3 all resolve to the same white in the light palette, so a
    // surface painted with one is invisible there and separates only under the
    // dark theme. Fills use bg-module-platform; separation is the hairline.
    expect(css).not.toContain('--dsw-alias-bg-layer')
    expect(block('.input')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(block('.card')).toContain('border: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.card')).not.toMatch(/\bbackground\s*:/)
  })

  it('takes its radii from the shared scale', () => {
    // Only four radii exist (`control` 8, `card` 16, `bubble` 24, `pill`), and
    // a hand-written number is a value the scale cannot move.
    expect(block('.card')).toContain('border-radius: var(--dsw-radius-card)')
    expect(block('.input')).toContain('border-radius: var(--dsw-radius-control)')
    expect(block('.prefix')).toContain('border-radius: var(--dsw-radius-pill)')
    const radii = [...css.matchAll(/border-radius:([^;]*);/g)].map(match => (match[1] ?? '').trim())
    expect(radii.length).toBeGreaterThan(0)
    for (const value of radii) expect(value, value).toMatch(/^var\(--dsw-radius-[a-z]+\)$/)
  })

  it('leaves exactly one card on the page: the form that belongs to nothing', () => {
    // `.card` standalone is the Add Provider form — it has to say where it
    // begins, because nothing above it does. The SAME form opened from a row
    // drops those bounds, or an open provider is a box inside a box. And the
    // empty state is two lines of prose with the Add control right under it,
    // so a box there fences the sentence off from its own answer.
    expect(block('.card')).toContain('border-radius: var(--dsw-radius-card)')
    expect(block('.row .card')).toContain('border: none')
    expect(block('.empty')).not.toMatch(/\bborder/)
  })

  it('gives the row lines the Account page\u2019s rhythm, not 4px', () => {
    // The complaint this closes: a generous run of empty page above a row that
    // packed identity, address and a managed sentence into three lines 4px
    // apart. The content, not the air, gets the room.
    expect(block('.row')).toContain('gap: 6px')
    expect(block('.row')).toContain('padding: 16px 0')
    // Prose takes a reading measure; a 720px line under two short ones reads
    // as a wall.
    expect(block('.row .note')).toContain('max-width: 60ch')
  })

  it('draws the provider list as hairlines, not as a card around rows', () => {
    // A box around a list of rows is a second edge around content the row
    // hairlines already separate, and it insets every provider from the column
    // the title and the intro are set on. The rules ARE the list: one above the
    // first row, one under each. A card here is reserved for a form that
    // belongs to nothing above it (`.card`) and for the empty state, which is
    // the section's whole content.
    expect(block('.rows')).toContain('border-top: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.rows')).not.toMatch(/border-radius/)
    expect(block('.row')).toContain('border-bottom: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.row')).not.toMatch(/border-radius/)
  })

  it('sets the routing prefix in the code face, where it is compared', () => {
    expect(block('.prefix')).toContain('font-family: var(--ds-font-family-code)')
    expect(block('.prefixInput')).toContain('font-family: var(--ds-font-family-code)')
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })
})
