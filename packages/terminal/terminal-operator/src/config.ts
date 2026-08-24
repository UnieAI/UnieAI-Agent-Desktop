/** Validated configuration for the operator terminal. */

import z from '@unieai/schemastery'

/** Public plugin configuration. */
export interface Config {
  /**
   * Whether the GUI may open a terminal at all (default: `true`).
   *
   * This tab runs any command as the user who started the app, which is what a
   * terminal is for; the switch exists so a deployment that does not want that
   * surface can remove it rather than hide it.
   */
  enabled?: boolean
  /** Interactive shell to run (default: `$SHELL`, then `/bin/bash`, then `/bin/sh`). */
  shellPath?: string
  /** Maximum retained UTF-8 bytes of output per terminal, for repaint after reconnect. */
  scrollbackMaxBytes?: number
  /** Maximum simultaneous live terminals per workspace. */
  maxTerminalsPerWorkspace?: number
  /** Grace before teardown escalates to `SIGKILL`. */
  disposeGraceMs?: number
}

/** Configuration after Schemastery defaults. */
export type ResolvedConfig = Required<Omit<Config, 'shellPath'>> & Pick<Config, 'shellPath'>

/** Schemastery config exposed by the plugin. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  shellPath: z.string().required(false),
  scrollbackMaxBytes: z.number().default(1024 * 1024),
  maxTerminalsPerWorkspace: z.number().default(4),
  disposeGraceMs: z.number().default(3_000),
})

/**
 * Assert every effective numeric config field is a positive safe integer.
 * @param config - Schemastery-resolved plugin configuration.
 * @returns Narrows the input to the fully resolved configuration.
 */
export function validateConfig(config: Config): asserts config is ResolvedConfig {
  const resolved = config as ResolvedConfig
  for (const name of ['scrollbackMaxBytes', 'maxTerminalsPerWorkspace', 'disposeGraceMs'] as const) {
    const value = resolved[name]
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`terminal-operator: ${name} must be a positive safe integer`)
    }
  }
  if (resolved.shellPath !== undefined && resolved.shellPath.length > 0 && !resolved.shellPath.startsWith('/')) {
    throw new Error('terminal-operator: shellPath must be absolute; a PATH search here would not pick the shell the user logs in with')
  }
}
