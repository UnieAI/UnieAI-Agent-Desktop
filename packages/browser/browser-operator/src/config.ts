/** Validated configuration for the operator browser. */

/** Public plugin configuration. */
export interface Config {
  /**
   * Whether the GUI may open a browser at all (default: `true`).
   *
   * The panel renders whatever a page sends it and runs that page on the
   * machine the Host runs on. The switch exists so a deployment that does not
   * want that surface can remove it rather than hide it.
   */
  enabled?: boolean
  /** Browser executable; default is the machine's own (see `chrome.ts`). */
  chromePath?: string
  /** Maximum simultaneous live browsers per workspace. */
  maxBrowsersPerWorkspace?: number
  /** JPEG quality of the streamed frames, 1–100. */
  frameQuality?: number
  /** Seconds to wait for the browser to print its DevTools endpoint. */
  startupTimeoutSeconds?: number
}

/** Configuration after Schemastery defaults. */
export type ResolvedConfig = Required<Omit<Config, 'chromePath'>> & Pick<Config, 'chromePath'>

/**
 * Assert every effective numeric config field is in range.
 * @param config - Schemastery-resolved plugin configuration.
 * @returns Narrows the input to the fully resolved configuration.
 */
export function validateConfig(config: Config): asserts config is ResolvedConfig {
  const resolved = config as ResolvedConfig
  for (const name of ['maxBrowsersPerWorkspace', 'startupTimeoutSeconds'] as const) {
    const value = resolved[name]
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`browser-operator: ${name} must be a positive safe integer`)
    }
  }
  if (!Number.isSafeInteger(resolved.frameQuality) || resolved.frameQuality < 1 || resolved.frameQuality > 100) {
    throw new Error('browser-operator: frameQuality must be an integer between 1 and 100')
  }
  if (resolved.chromePath !== undefined && resolved.chromePath !== '' && !resolved.chromePath.startsWith('/')
    && !/^[A-Za-z]:\\/u.test(resolved.chromePath)) {
    throw new Error('browser-operator: chromePath must be absolute; a PATH search would not name the browser a person chose')
  }
}
