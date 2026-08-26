/**
 * The filesystem answers for {@link ChromeProbe}.
 *
 * Its own module because BOTH faces need it — the service and the
 * launch-and-speak-CDP face a screenshot tool uses — and importing the service
 * to reach it would drag a browser registry into a package that wants a path.
 * @module @unieai/uad-browser-operator/probe
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { ChromeProbe } from './chrome.ts'

/** Executable-and-directory probe against the real filesystem. */
export const FILESYSTEM_CHROME_PROBE: ChromeProbe = {
  exists(path: string): boolean {
    return existsSync(path)
  },
  list(path: string): readonly string[] {
    try {
      return readdirSync(path)
    } catch {
      return []
    }
  },
  manifest(specifier: string): string | undefined {
    try {
      // `require.resolve` throws for a package that is not installed, which for
      // an optional platform payload is the ordinary case: npm installs the one
      // matching `os`/`cpu` and skips the other three.
      return createRequire(import.meta.url).resolve(specifier)
    } catch {
      return undefined
    }
  },
  readManifest(path: string): { executable?: unknown } | undefined {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as { executable?: unknown }
    } catch {
      // A half-extracted install falls through to the search rather than
      // taking the call down with it.
      return undefined
    }
  },
}
