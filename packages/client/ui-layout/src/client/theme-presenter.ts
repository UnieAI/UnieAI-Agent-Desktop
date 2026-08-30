/**
 * Global theme DOM applier: projects the resolved ThemeSnapshot onto the
 * document — `html { color-scheme }` for native UA chrome (scrollbars, form
 * controls), `body[data-ds-dark-theme]` for the token palette, the active
 * theme's alias-token overrides as inline CSS variables on body, and one
 * presenter-owned `meta[name="theme-color"]` for surrounding browser UI. Pure
 * DOM writes, no React involvement; the presenter only ever retracts what it
 * wrote itself, so foreign attributes, metadata, and inline styles survive.
 */
import type { ThemeSnapshot } from '@unieai/uad-client-ui-theme/client'

/** Body attribute selecting the dark base palette in the token stylesheets. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * Marks the `theme-color` metadata the page ships for the paint before this
 * app boots.
 *
 * Those are scheme-scoped and follow the OS, and a media-matching meta EARLIER
 * in the document beats a later unscoped one — so while they stand, a person
 * who chose the theme their OS is not set to keeps seeing the OS's colour in
 * the browser chrome. They are the pre-boot answer, and this presenter is the
 * answer afterwards.
 */
export const BOOT_THEME_COLOR_ATTRIBUTE = 'data-boot-theme-color'

/** Applies theme snapshots to the document; one instance per plugin fiber. */
export class ThemePresenter {
  /** Token names this presenter wrote in the last apply (its retraction set). */
  private appliedTokens: string[] = []
  /** The single metadata node this presenter inserts and removes. */
  private readonly themeColorMeta: HTMLMetaElement
  /** The page's pre-boot metadata, held out of the document until teardown. */
  private bootMetas: HTMLMetaElement[] = []

  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), then replace the previously applied token variables
   * with `active.tokens`. Browser theme-color metadata follows the computed
   * body background after those writes, so the rendered palette remains the
   * color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor
    if (!this.themeColorMeta.isConnected) {
      // The handover: the page's own pre-boot metadata comes out as this one
      // goes in, so exactly one `theme-color` stands and it is the one that
      // follows the theme the person actually chose.
      this.bootMetas = [...document.head.querySelectorAll<HTMLMetaElement>(
        `meta[name="theme-color"][${BOOT_THEME_COLOR_ATTRIBUTE}]`,
      )]
      for (const meta of this.bootMetas) meta.remove()
      document.head.append(this.themeColorMeta)
    }
  }

  /** Retract root color-scheme, the palette attribute, token variables, and the owned metadata node. */
  dispose(): void {
    document.documentElement.style.removeProperty('color-scheme')
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
    // Put the page back the way it was found: with no presenter, the pre-boot
    // metadata is again the only answer there is.
    for (const meta of this.bootMetas) document.head.append(meta)
    this.bootMetas = []
  }
}
