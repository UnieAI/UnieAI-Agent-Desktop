/**
 * Account section stylesheet contract, asserted against the CSS text on disk.
 *
 * A `--dsw-*` name the theme does not declare fails silently: the browser
 * takes the `var()` fallback, so the sheet still renders and only one palette
 * looks wrong. Checking the names against the sheets that declare them is what
 * turns that into a test failure.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AccountSection.module.css', import.meta.url)), 'utf8')
const rowCss = readFileSync(fileURLToPath(new URL('../src/client/SidebarAccountRow.module.css', import.meta.url)), 'utf8')
const heatCss = readFileSync(fileURLToPath(new URL('../src/client/ActivityHeatmap.module.css', import.meta.url)), 'utf8')
// Every theme sheet, not just the platform tokens: radius, type, and font
// variables are declared in siblings, and a gate reading one file would call
// their names undeclared.
const tokens = readdirSync(fileURLToPath(new URL('../../ui-theme/src/styles/', import.meta.url)))
  .filter(name => name.endsWith('.css'))
  .map(name => readFileSync(fileURLToPath(new URL(`../../ui-theme/src/styles/${name}`, import.meta.url)), 'utf8'))
  .join('\n')

/** The declarations of one top-level rule, by selector. */
function block(selector: string): string {
  return ruleOf(css, selector, 'AccountSection.module.css')
}

/** The same, in the heatmap's own sheet. */
function heat(selector: string): string {
  return ruleOf(heatCss, selector, 'ActivityHeatmap.module.css')
}

function ruleOf(sheet: string, selector: string, name: string): string {
  const match = new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(sheet)
  if (match === null) throw new Error(`${name} has no \`${selector}\` rule`)
  return match[1] ?? ''
}

describe('AccountSection theme styles', () => {
  it('names only theme variables the token sheets define', () => {
    // Both sheets: the sidebar row paints from the same ladder, and an
    // undeclared name there fails exactly as silently.
    const named = [...`${css}\n${rowCss}\n${heatCss}`.matchAll(/var\((--(?:dsw|dsh|ds)-[a-z0-9-]+)/g)]
      .map(match => match[1])
    // The two scrollbar indirections are declared by the theme's scrollbar
    // sheet as the rebinding seam, and rebound — not declared — by a feature.
    const seam = ['--dsh-scrollbar-thumb', '--dsh-scrollbar-thumb-hover']
    const undeclared = [...new Set(named)]
      .filter(name => !seam.includes(String(name)))
      .filter(name => !tokens.includes(`  ${String(name)}:`))
    expect(undeclared).toEqual([])
  })

  it('fills the sidebar seat\'s shared row without drawing a second box', () => {
    const row = /^\.row \{([^}]*)\}/m.exec(rowCss)?.[1] ?? ''
    // The 248x40 box at `6px 8px` belongs to the sidebar foot's identity seat,
    // which this occupant shares with the settings glyph. What is owned here
    // is the content: the 10px gap, the mark, and the name that takes the
    // slack. The row keeps the inherited type — the 13/500 is the name's.
    expect(row).toContain('padding: 0')
    expect(row).toContain('flex: 1')
    expect(row).toContain('min-width: 0')
    expect(row).toContain('gap: 10px')
    expect(row).not.toContain('border-radius')
    const name = /^\.name \{([^}]*)\}/m.exec(rowCss)?.[1] ?? ''
    expect(name).toContain('font-size: 13px')
    expect(name).toContain('font-weight: 500')
    const avatar = /^\.avatar \{([^}]*)\}/m.exec(rowCss)?.[1] ?? ''
    expect(avatar).toContain('width: 28px')
    expect(avatar).toContain('border-radius: var(--dsw-radius-pill)')
    // The rail keeps the 36px control box every other rail control uses.
    expect(/^\.rail \{([^}]*)\}/m.exec(rowCss)?.[1] ?? '').toContain('width: 36px')
  })

  it('writes no literal colour in the sidebar row either', () => {
    expect(rowCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(rowCss).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
    expect(rowCss).not.toContain('--dsw-alias-brand')
  })

  it('never falls back to a literal colour', () => {
    expect(css).not.toMatch(/var\(--dsw?-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
  })

  it('writes no literal colour at all', () => {
    // Feature CSS resolves every colour through a semantic alias
    // (docs/web-styling.md); a hex or rgb() here would be one value for both
    // palettes. `#` also catches an id selector, which this sheet never uses.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
  })

  it('keeps the brand hue out: this screen has no second blue', () => {
    // The one control the screen wants pressed takes its weight from the
    // Button primitive's primary family (neutral ink, exactly as the web
    // product's own primary button). A hue painted here would be the second
    // one on the screen, and the design language allows exactly one.
    expect(css).not.toContain('--dsw-static-deepseek')
    expect(css).not.toContain('--dsw-alias-brand')
    expect(block('.fill')).toContain('background: var(--dsw-alias-label-primary)')
  })

  it('fills with bg-module-platform, never a bg-layer step', () => {
    // bg-layer-1/2/3 all resolve to the same white in the light palette, so a
    // surface painted with one is invisible there and separates only under the
    // dark theme. Fills use bg-module-platform; separation is the hairline.
    expect(css).not.toContain('--dsw-alias-bg-layer')
    expect(block('.track')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(block('.card')).toContain('border: 1px solid var(--dsw-alias-border-l2)')
    expect(block('.card')).not.toMatch(/\bbackground\s*:/)
  })

  it('takes its radii and reading type from the shared scale', () => {
    expect(block('.card')).toContain('border-radius: var(--dsw-radius-card)')
    expect(heat('.toggle')).toContain('border-radius: var(--dsw-radius-control)')
    expect(block('.overviewMark')).toContain('border-radius: var(--dsw-radius-pill)')
    expect(block('.body')).toContain('font-size: var(--dsw-chat-body-size)')
    expect(block('.body')).toContain('line-height: var(--dsw-chat-body-leading)')
  })

  it('closes every block, so no rule is swallowed by the one above it', () => {
    for (const sheet of [css, rowCss, heatCss]) {
      const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
      expect((bare.match(/\}/g) ?? []).length).toBe((bare.match(/\{/g) ?? []).length)
    }
  })
})

describe('ActivityHeatmap theme styles', () => {
  it('writes no literal colour, and no brand hue, in the shade ramp either', () => {
    // The reference ramps ten Tailwind zinc literals (five per palette). This
    // sheet has no such budget: every step has to resolve through tokens, or
    // one palette silently loses the low end of the scale.
    expect(heatCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(heatCss).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
    expect(heatCss).not.toContain('--dsw-alias-brand')
    expect(heatCss).not.toContain('--dsw-static-deepseek')
  })

  it('ramps between exactly two tokens, so both palettes invert together', () => {
    // Level 0 is the empty cell's own surface and level 4 is the page's ink;
    // every step between them mixes those same two, which is what makes the
    // ramp read as dark-on-light and light-on-dark without a second sheet.
    expect(heat('.level0')).toContain('background: var(--dsw-alias-bg-module-platform)')
    expect(heat('.level4')).toContain('background: var(--dsw-alias-label-primary)')
    for (const step of ['.level1', '.level2', '.level3']) {
      const rule = heat(step)
      expect(rule).toContain('color-mix(in srgb, var(--dsw-alias-label-primary)')
      expect(rule).toContain('var(--dsw-alias-bg-module-platform))')
    }
  })

  it('rebinds the scrollbar pair, because a year of cells is an elevated surface', () => {
    // ui-theme's scrollbar contract: a sheet that scrolls on an elevated
    // surface must rebind the thumb, or it keeps the base-level colour and
    // vanishes against the raised one.
    const scroller = heat('.heatmap')
    expect(scroller).toContain('overflow-x: auto')
    expect(scroller).toContain('--dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2)')
    expect(scroller).toContain('--dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2)')
  })

  it('scrolls inside itself rather than widening the settings column', () => {
    // 53 columns need 689px and the panel's content column is narrower than
    // that on a phone. The grid keeps its own minimum and the container
    // scrolls; the page must never be the thing that scrolls sideways.
    expect(heat('.heatmap')).toContain('width: 100%')
    expect(heat('.heatmap')).toContain('min-width: 0')
    expect(heat('.grid')).toContain('min-width: 689px')
    expect(heat('.week')).toContain('flex: 1')
  })
})
