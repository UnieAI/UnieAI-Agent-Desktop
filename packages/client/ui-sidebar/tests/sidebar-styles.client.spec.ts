/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('8px')
    expect(root?.get('padding')).toBe('0 var(--dsh-sidebar-inline-padding)')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--dsh-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBe('0')
  })

  it('moves the four upper controls while the settings seat only fades', () => {
    const animation = 'rail-in 150ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
      '.railIn .regionArea',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 150ms var(--ds-ease-in-out) backwards',
    )
    expect(css).toMatch(
      /@keyframes rail-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(49px\);\s*}\s*}/,
    )
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives shell rail controls the same base anchor for their shared translation', () => {
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('36px')
  })

  it('keeps the slotted brand row on the identity plate', () => {
    // The mark sits in a 28px hairline plate and the name is set at the
    // reference header's 13/600, so both slot occupants share one 28px box.
    expect(declarations('.brandIdentity')?.get('height')).toBe('28px')
    expect(declarations('.brandMark')?.get('width')).toBe('28px')
    expect(declarations('.brandMark')?.get('height')).toBe('28px')
    expect(declarations('.brandName')?.get('height')).toBe('20px')
    expect(declarations('.brandName')?.get('line-height')).toBe('20px')
    expect(declarations('.brandName')?.get('font-size')).toBe('13px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('13px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })

  it('closes the column with one identity row under a hairline foot', () => {
    // The foot is the one place the column draws a rule: it separates the
    // list from the row that is about the person using it. The rail drops
    // both the rule and the row inset.
    expect(declarations('.footArea')?.get('margin'))
      .toBe('0 calc(-1 * var(--dsh-sidebar-inline-padding))')
    expect(declarations('.footArea')?.get('padding'))
      .toBe('8px calc(var(--dsh-sidebar-inline-padding) + 2px)')
    expect(declarations('.collapsed .footArea')?.get('margin')).toBe('0')
    expect(declarations('.footArea')?.get('border-top')).toBe('1px solid var(--dsw-alias-border-l2)')
    expect(declarations('.collapsed .footArea')?.get('border-top')).toBe('none')
    expect(declarations('.footerActions')?.get('width')).toBe('100%')
  })

  it('gives the account and settings occupants one shared row box', () => {
    // The reference column closes with a single 248x40 row at the control
    // radius — `6px 8px` around a 28px mark, 10px gaps — and two packages
    // share it, so the seat owns the box and neither occupant draws a second.
    const row = declarations('.identityRow')
    expect(row?.get('display')).toBe('flex')
    expect(row?.get('align-items')).toBe('center')
    expect(row?.get('gap')).toBe('10px')
    expect(row?.get('padding')).toBe('6px 8px')
    expect(row?.get('border-radius')).toBe('var(--dsw-radius-control)')
    expect(row?.get('width')).toBe('calc(100% + 4px)')
    expect(row?.get('margin')).toBe('0 -2px')
    // The rail turns the same row on its side: two 36px controls, no box.
    const rail = declarations('.collapsed .identityRow')
    expect(rail?.get('flex-direction')).toBe('column')
    expect(rail?.get('padding')).toBe('8px 0 0')
    expect(rail?.get('gap')).toBe('4px')
  })

  it('keeps the reference row box on New chat', () => {
    // The reference builds the row out of padding and leading rather than a
    // fixed height (7px + 19.5px + 7px = 33.5px), and leaves the row itself at
    // the inherited weight — the label span alone carries the 500.
    const row = declarations('.newSession')
    expect(row?.get('height')).toBeUndefined()
    expect(row?.get('padding')).toBe('7px 10px')
    expect(row?.get('gap')).toBe('10px')
    expect(row?.get('font-size')).toBe('13px')
    expect(row?.get('line-height')).toBe('19.5px')
    expect(row?.get('font-weight')).toBe('400')
    expect(declarations('.newSessionLabel')?.get('font-weight')).toBe('500')
    expect(row?.get('border-radius')).toBe('var(--dsw-radius-control)')
    expect(row?.get('color')).toBe('var(--dsw-alias-label-secondary)')
    expect(declarations('.newSession:hover')?.get('color')).toBe('var(--dsw-alias-label-primary)')
  })

  it('sets the brand header on the reference column\'s own top rhythm', () => {
    // 12px above and 4px below a 36px trigger: the 28px identity plate lands
    // 16px from the column top and the row below it starts at 56px.
    expect(declarations('.logoRow')?.get('height')).toBe('52px')
    expect(declarations('.logoRow')?.get('padding')).toBe('12px 0 4px')
    expect(declarations('.brand')?.get('padding')).toBe('4px 6px')
    expect(declarations('.brand:hover')?.get('background'))
      .toBe('var(--dsw-alias-interactive-bg-hover)')
  })
})
