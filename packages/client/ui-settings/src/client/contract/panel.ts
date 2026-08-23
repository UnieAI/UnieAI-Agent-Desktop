/**
 * The settings panel's open seam: how a surface OUTSIDE the settings domain
 * asks for the panel at a named section.
 *
 * The type lives here, in the settings base layer, for the same reason the
 * slot types do — a caller may be any feature package, and the shell that
 * implements it (ui-settings-general) depends on ui-sidebar, so a caller
 * reaching for the shell's own package would close a reference cycle. The
 * base layer depends on no `ui-*` package, so everyone can reach it.
 *
 * This package declares the service and provides nothing: the shell that
 * draws the panel provides it, because the panel's open state is the shell's.
 * A composition without that shell has no `settingsPanel`, which is why every
 * caller reads it optionally and draws no control when it is absent.
 *
 * @module @deepseek-ai/dsh-client-ui-settings
 */

/** What the settings shell exposes to surfaces that want to open it. */
export interface SettingsPanelFace {
  /**
   * Open the settings panel, optionally on one registered section and
   * scrolled to one anchor inside it.
   * @param sectionId - `settings.section` registration id; omitted opens the first section.
   * @param anchorId - anchor within that section; the section decides what it names.
   */
  open: (sectionId?: string, anchorId?: string) => void
}

/** The cordis service name the settings shell provides its panel face under. */
export const SETTINGS_PANEL_SERVICE = 'settingsPanel'

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsPanel: SettingsPanelFace
  }
}
