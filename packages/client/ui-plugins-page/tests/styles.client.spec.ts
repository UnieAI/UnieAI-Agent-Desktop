/**
 * Plugins page stylesheet contract, asserted against the CSS text on disk.
 *
 * A `--dsw-*` name the theme does not declare fails silently: the browser
 * takes the `var()` fallback, so the sheet still renders and only one palette
 * looks wrong. Checking the names against the sheets that declare them is what
 * turns that into a test failure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SHEETS = ['PluginsPage', 'PluginsNavRow', 'StudioMcpArea', 'DirectoryArea'] as const

const sheet = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/client/${name}.module.css`, import.meta.url)), 'utf8')

const css = Object.fromEntries(SHEETS.map(name => [name, sheet(name)])) as Record<typeof SHEETS[number], string>
const all = SHEETS.map(name => css[name]).join('\n')

// Every theme sheet, not just the platform tokens: radius, type, and font
// variables are declared in siblings, and a gate reading one file would call
// their names undeclared.
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

/** The declarations of one top-level rule, by selector, in one sheet. */
function block(name: typeof SHEETS[number], selector: string): string {
  const match = new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(css[name])
  if (match === null) throw new Error(`${name}.module.css has no \`${selector}\` rule`)
  return match[1] ?? ''
}

describe('Plugins page theme styles', () => {
  it('names only theme variables the token sheets define', () => {
    const named = [...all.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)].map(match => match[1])
    const undeclared = [...new Set(named)].filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
  })

  it('writes no literal colour at all', () => {
    // Feature CSS resolves every colour through a semantic alias
    // (docs/web-styling.md); a hex or rgb() here would be one value for both
    // palettes. `#` also catches an id selector, which these sheets never use.
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(all).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('never falls back to a literal value', () => {
    expect(all).not.toMatch(/var\(--(?:dsw|dsh|ds)-[a-z0-9-]+\s*,/)
  })

  it('keeps the brand hue out: this page has no second blue', () => {
    expect(all).not.toContain('--dsw-static-deepseek')
    expect(all).not.toContain('--dsw-alias-brand')
  })

  it('paints the page on the base surface, because it is a place and not a dialog', () => {
    expect(block('PluginsPage', '.page')).toContain('background: var(--dsw-alias-bg-base)')
    expect(block('PluginsPage', '.page')).toContain('position: absolute')
  })

  it('centres one reading measure that the header band and every area share', () => {
    // The page became a directory: a row is a name over a one-line description,
    // and those descriptions set across a 1400px frame are scanned rather than
    // read. The measure is asserted HERE, on the page, and not in an area,
    // because an area that centred itself while its neighbour ran full width
    // would put two column edges on one page.
    const measure = block('PluginsPage', '.measure')
    expect(measure).toContain('width: 100%')
    expect(measure).toContain('max-width: 720px')
    expect(measure).toContain('margin: 0 auto')
  })

  it('leaves the directory area to inherit that measure rather than set its own', () => {
    expect(block('DirectoryArea', '.area')).not.toContain('max-width')
    expect(block('DirectoryArea', '.area')).not.toContain('margin: 0 auto')
  })

  it('fills the chosen filter pill and the plugin mark with the one token that shows in both palettes', () => {
    // bg-layer-1..3 all resolve to the same white in light, so a pill filled
    // with one would leave the current filter invisible exactly where it is
    // needed most.
    expect(block('DirectoryArea', '.pillActive')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(block('DirectoryArea', '.pillActive')).not.toContain('bg-layer-')
    expect(block('DirectoryArea', '.mark')).not.toContain('bg-layer-')
  })

  it('keeps every directory radius on the shared scale', () => {
    for (const selector of ['.pill', '.search', '.mark', '.action', '.retry']) {
      const rule = block('DirectoryArea', selector)
      const radius = /border-radius:\s*([^;]+);/u.exec(rule)?.[1]
      if (radius !== undefined) expect(radius).toMatch(/var\(--dsw-radius-/u)
    }
  })

  it('clips a row description to one line, so a pair of rows keeps one height', () => {
    const desc = block('DirectoryArea', '.rowDesc')
    expect(desc).toContain('white-space: nowrap')
    expect(desc).toContain('text-overflow: ellipsis')
    expect(desc).toContain('overflow: hidden')
  })

  it('takes its radii from the shared scale', () => {
    // The tool card takes the control radius, not the card one: at tile size
    // 16px reads as a blob. Both names are on the shared scale; neither is a
    // number pasted here.
    expect(block('StudioMcpArea', '.card')).toContain('border-radius: var(--dsw-radius-control)')
    expect(block('StudioMcpArea', '.notice')).toContain('border-radius: var(--dsw-radius-card)')
    expect(block('PluginsNavRow', '.row')).toContain('border-radius: var(--dsw-radius-control)')
  })

  it('sets tool names and server origins in the code face, where they are typed', () => {
    expect(block('StudioMcpArea', '.origin')).toContain('font-family: var(--ds-font-family-code)')
    expect(block('StudioMcpArea', '.cardName')).toContain('font-family: var(--ds-font-family-code)')
  })

  it('keeps the tool card off bg-layer-1, which the light palette makes invisible', () => {
    // `--dsw-alias-bg-layer-1` resolves to the SAME value as
    // `--dsw-alias-bg-base` in the light theme, and this page paints base. A
    // fill-only card using it would exist in dark and vanish in light.
    expect(block('StudioMcpArea', '.card')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(block('StudioMcpArea', '.card')).not.toContain('bg-layer-1')
  })

  it('lets the tool grid reflow instead of pushing the page sideways', () => {
    // The page runs full width down to a 390px frame. An `auto-fill` track
    // with a bare px floor overflows once the floor exceeds the container;
    // the `min(..., 100%)` floor is what makes one column the worst case.
    const grid = block('StudioMcpArea', '.grid')
    expect(grid).toContain('grid-template-columns: repeat(auto-fill, minmax(min(')
    expect(grid).toContain(', 100%), 1fr))')
    expect(grid).toContain('min-width: 0')
  })

  it('draws the shell\'s own nav-row box, which the column holds no state for', () => {
    // ui-sidebar's geometry contract: 248x34 at `7px 10px` around a 13/19.5
    // line with a 10px gap, collapsing to the rail's 36px control.
    const row = block('PluginsNavRow', '.row')
    expect(row).toContain('padding: 7px 10px')
    expect(row).toContain('gap: 10px')
    expect(row).toContain('line-height: 19.5px')
    expect(block('PluginsNavRow', '.rail')).toContain('width: 36px')
  })

  it('honours reduced motion wherever it eases something', () => {
    for (const name of SHEETS) {
      if (!css[name].includes('transition:')) continue
      expect(css[name]).toContain('@media (prefers-reduced-motion: reduce)')
    }
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    for (const name of SHEETS) {
      const bare = css[name].replace(/\/\*[\s\S]*?\*\//g, '')
      expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
    }
  })
})
