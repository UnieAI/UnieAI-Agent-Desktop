/**
 * Plugins surface stylesheet contract, asserted against the CSS text on disk.
 *
 * A `--dsw-*` name the theme does not declare fails silently: the browser
 * takes the `var()` fallback, so the sheet still renders and only one palette
 * looks wrong. Checking the names against the sheets that declare them is what
 * turns that into a test failure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SHEETS = [
  'PluginsPage', 'PluginsTabs', 'PluginsNavRow', 'StudioMcpArea', 'StudioEntry', 'DirectoryArea',
  'SkillsArea',
] as const

/**
 * Custom properties the FRAME publishes, not the theme.
 *
 * `--dsh-shell-sidebar-width` is ui-layout's `SIDEBAR_WIDTH_PROPERTY`, set as
 * an inline style on the frame element and inherited from there; no token
 * sheet declares it, and it must not, because its value is geometry that
 * changes on every drag.
 */
const FRAME_PUBLISHED = ['--dsh-shell-sidebar-width']

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
    const undeclared = [...new Set(named)]
      .filter(name => !FRAME_PUBLISHED.includes(String(name)))
      .filter(name => !tokens.includes(`  ${String(name)}:`))
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

  it('paints the surface on the base surface, because it is a place and not a dialog', () => {
    expect(block('PluginsPage', '.view')).toContain('background: var(--dsw-alias-bg-base)')
    expect(block('PluginsPage', '.view')).toContain('position: absolute')
  })

  it('leaves the navigation column uncovered by offsetting to the frame’s own column width', () => {
    // This is the whole main-area change. `shell.overlay` spans the frame, so
    // an inset of 0 here would cover the sidebar and take away both the row
    // that says where the reader is and every place they might go next.
    const view = block('PluginsPage', '.view')
    expect(view).toContain('left: var(--dsh-shell-sidebar-width)')
    expect(view).not.toContain('inset: 0')
    for (const side of ['top: 0', 'right: 0', 'bottom: 0']) expect(view).toContain(side)
  })

  it('centres one reading measure that the title and every area share', () => {
    // The surface is a directory: a row is a name over a one-line description,
    // and those descriptions set across a 1400px main area are scanned rather
    // than read. The measure is asserted HERE, on the surface, and not in an
    // area, because an area that centred itself while its neighbour ran full
    // width would put two column edges on one surface.
    const measure = block('PluginsPage', '.measure')
    expect(measure).toContain('width: 100%')
    expect(measure).toContain('max-width: 980px')
    expect(measure).toContain('margin: 0 auto')
  })

  it('keeps every elevated fill out of the sheet that scrolls', () => {
    // ui-theme's scrollbar-rebind invariant reasons per FILE: a chosen pill
    // and a scroll container in one sheet reads as "scrolls on an elevated
    // surface" and demands a thumb rebind this surface must not make.
    const bare = (name: typeof SHEETS[number]): string => css[name].replace(/\/\*[\s\S]*?\*\//g, '')
    expect(bare('PluginsPage')).toContain('overflow-y: auto')
    expect(bare('PluginsPage')).not.toContain('bg-module-platform')
    expect(bare('PluginsTabs')).not.toMatch(/overflow[-a-z]*:\s*(?:auto|scroll)/)
  })

  it('marks the chosen destination and the pressed gear with the one fill both palettes show', () => {
    expect(block('PluginsTabs', '.tabActive')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(block('PluginsTabs', '.actionActive')).toContain('background: var(--dsw-alias-bg-module-platform)')
  })

  it('runs the search field the full measure, which is what puts it first', () => {
    const search = block('DirectoryArea', '.search')
    expect(search).toContain('width: 100%')
    expect(search).toContain('border-radius: var(--dsw-radius-pill)')
  })

  it('gives the installed strip a tile large enough to identify a plugin without a name', () => {
    const large = block('DirectoryArea', '.markLarge')
    expect(large).toContain('width: 44px')
    expect(large).toContain('height: 44px')
  })

  it('wraps the installed strip instead of scrolling it', () => {
    // A horizontal scroller would put a second scrollbar inside a surface that
    // already has one, and this sheet paints elevated fills, so a scroll
    // container in it would demand a thumb rebind.
    expect(block('DirectoryArea', '.tiles')).toContain('flex-wrap: wrap')
    expect(css['DirectoryArea'].replace(/\/\*[\s\S]*?\*\//g, ''))
      .not.toMatch(/overflow[-a-z]*:\s*(?:auto|scroll)/)
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
    expect(block('DirectoryArea', '.install')).toContain('background: var(--dsw-alias-bg-module-platform)')
  })

  it('keeps every directory radius on the shared scale', () => {
    for (const selector of ['.pill', '.search', '.mark', '.install', '.more', '.menu', '.retry']) {
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

  it('draws the Studio mark as pixel art rather than a smoothed downscale', () => {
    // The source is 162x162 pixel art rendered into a 40px tile. Every default
    // smoothing filter turns its one-pixel edges into grey fringes at that
    // size, which is the whole reason the rule is asserted rather than left to
    // the browser default.
    const mark = block('StudioEntry', '.mark')
    expect(mark).toContain('image-rendering: pixelated')
    expect(mark).toContain('width: 40px')
    expect(mark).toContain('height: 40px')
  })

  it('states the bound entry in the success colour and in words', () => {
    // A dot beside the word would say the same thing twice, and the word is
    // what survives a reader who cannot separate the two hues.
    expect(block('StudioEntry', '.connected'))
      .toContain('color: var(--dsw-alias-state-success-primary)')
  })

  it('gives the bind action the catalogue’s own install pill', () => {
    // Same decision, same column position, so it must not read as a different
    // kind of control from the row below it.
    const bind = block('StudioEntry', '.bind')
    expect(bind).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(bind).toContain('border-radius: var(--dsw-radius-pill)')
    expect(bind).toContain('text-decoration: none')
  })

  it('wraps the Studio tool strip instead of scrolling it', () => {
    // This sheet paints elevated fills, so a scroll container in it would
    // demand the thumb rebind ui-theme's invariant reasons about per file.
    expect(block('StudioEntry', '.tools')).toContain('flex-wrap: wrap')
    expect(css['StudioEntry'].replace(/\/\*[\s\S]*?\*\//g, ''))
      .not.toMatch(/overflow[-a-z]*:\s*(?:auto|scroll)/)
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
