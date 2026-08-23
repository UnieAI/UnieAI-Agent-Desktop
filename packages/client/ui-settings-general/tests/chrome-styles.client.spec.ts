/**
 * Style contracts of the shell's two visually-hidden accessible names.
 *
 * jsdom does no layout, so nothing in a component spec can prove a word is
 * out of the picture. These names sit where a painted word would do damage —
 * the trigger label at the right end of the sidebar's identity row, over the
 * account occupant beside it; the close label across the panel header — so
 * the guarantee is asserted against the sheets on disk.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Declarations of one exact top-level rule.
 * @param file - sheet basename under `src/client/`.
 * @param selector - the rule's selector text.
 * @returns the rule body, or '' when absent.
 */
function rule(file: string, selector: string): string {
  const css = readFileSync(fileURLToPath(new URL(`../src/client/${file}`, import.meta.url)), 'utf8')
  return new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
}

describe('visually-hidden accessible names', () => {
  it('clips the trigger label in both properties, and takes it out of flow', () => {
    // `clip` is deprecated: an engine that drops it must still find
    // `clip-path`, or the word paints over the account row beside the gear.
    const body = rule('chrome.module.css', '.triggerLabel')
    expect(body).toContain('position: absolute')
    expect(body).toContain('clip: rect(0 0 0 0)')
    expect(body).toContain('clip-path: inset(50%)')
    expect(body).toContain('overflow: hidden')
  })

  it('clips the panel close label the same way', () => {
    const body = rule('SettingsRoot.module.css', '.hiddenLabel')
    expect(body).toContain('position: absolute')
    expect(body).toContain('clip: rect(0 0 0 0)')
    expect(body).toContain('clip-path: inset(50%)')
  })

  it('leaves the wide trigger as the glyph box alone, with no row of its own', () => {
    // The 248x40 row belongs to ui-sidebar's identity seat, shared with the
    // account occupant. A trigger that grew its own box would push that
    // occupant out of the row it is supposed to share.
    const body = rule('SettingsRoot.module.css', '.trigger')
    expect(body).toContain('width: 15px')
    expect(body).toContain('height: 15px')
    expect(body).toContain('padding: 0')
    expect(body).toContain('color: var(--dsw-alias-label-tertiary)')
    expect(body).not.toMatch(/\bmargin\s*:/)
  })
})
