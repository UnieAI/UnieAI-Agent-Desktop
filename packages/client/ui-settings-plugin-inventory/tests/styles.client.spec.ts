/**
 * Plugin directory stylesheet contract, asserted against the CSS text on disk.
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
  fileURLToPath(new URL('../src/client/PluginDirectoryArea.module.css', import.meta.url)),
  'utf8',
)

/** The sheet with its comments removed, so prose about a token is not a use of it. */
const declared = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The property names one rule sets, so `box-sizing` is not read as a border. */
function properties(selector: string): readonly string[] {
  return block(selector)
    .split(';')
    .map(declaration => declaration.trim().split(':')[0]?.trim() ?? '')
    .filter(name => name !== '')
}

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
  if (match === null) throw new Error(`PluginDirectoryArea.module.css has no \`${selector}\` rule`)
  return match[1] ?? ''
}

describe('plugin directory theme styles', () => {
  it('names only theme variables the token sheets define', () => {
    const named = [...css.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
  })

  it('writes no literal colour and never falls back to one', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
    expect(css).not.toMatch(/var\(--(?:dsw|dsh|ds)-[a-z0-9-]+\s*,/)
  })

  it('keeps the brand hue out: this page has no second blue', () => {
    expect(css).not.toContain('--dsw-static-deepseek')
    expect(css).not.toContain('--dsw-alias-brand')
  })

  it('uses no bg-layer-* fill, which the light palette makes invisible', () => {
    // Layers 1-3 all resolve to the same white the page already paints, so a
    // surface using one would exist in dark and vanish in light. The directory
    // needs no fill: separation is the hairline under each group heading.
    expect(declared).not.toContain('bg-layer')
    expect(block('.groupHead')).toContain('border-bottom: 1px solid var(--dsw-alias-border-l2)')
  })

  it('draws a row as a row, with no card chrome around it', () => {
    // The reference's plugin rows carry no border, fill or radius either;
    // boxing a two-line row puts a well around the one thing being read.
    const row = properties('.row')
    expect(row).not.toContain('border')
    expect(row).not.toContain('background')
    expect(row).not.toContain('border-radius')
  })

  it('lets the row grid reflow instead of pushing the page sideways', () => {
    // The page runs full width down to a 390px frame. An `auto-fill` track
    // with a bare px floor overflows once the floor exceeds the container;
    // the `min(..., 100%)` floor is what makes one column the worst case.
    const grid = block('.grid')
    expect(grid).toContain('grid-template-columns: repeat(auto-fill, minmax(min(')
    expect(grid).toContain(', 100%), 1fr))')
    expect(grid).toContain('min-width: 0')
  })

  it('sets the module specifier in the code face, where it is typed', () => {
    expect(block('.rowSpec')).toContain('font-family: var(--ds-font-family-code)')
  })

  it('takes the status dot radius from the shared scale', () => {
    expect(block('.dot')).toContain('border-radius: var(--dsw-radius-pill)')
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
  })
})
