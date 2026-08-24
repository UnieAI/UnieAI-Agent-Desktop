/**
 * Legacy-name forwarders that let plugins written for the upstream harness
 * resolve against this product's renamed packages.
 *
 * WHY THIS EXISTS. Every package here was renamed from `@deepseek-ai/dsh-*` to
 * `@unieai/uad-*` ([mapping](../../../../docs/rescope.md)). The community
 * plugin ecosystem was not: a published plugin declares peer dependencies on
 * the upstream names and injects them by name into the client bundle. Nothing
 * about those plugins is incompatible — only the spelling of what they ask
 * for. Without this, installing any of them fails to resolve.
 *
 * WHY FORWARDER PACKAGES AND NOT SYMLINKS. The obvious alias is a second
 * symlink beside the one {@link healProfilesModuleFallback} already writes.
 * That works under Node's default resolution, which resolves a symlink to its
 * real path and therefore caches one module instance for both names. It breaks
 * under `--preserve-symlinks`, which Electron's Node applies: the two links
 * resolve to two paths, the package is instantiated twice, and `instanceof`
 * across the pair fails — for `@unieai/cordis` that means two `Context`
 * classes and no shared services. A forwarder is a real directory whose module
 * re-exports the target, so BOTH resolution modes reach one instance: the
 * forwarder is a distinct module, but the package it re-exports is loaded once.
 *
 * The desktop shell is the reason this distinction is not academic — it runs
 * the harness inside Electron, so a shim that only works under plain Node
 * would fail exactly where the product ships.
 */

/** Manifest key marking a generated forwarder, so an installed package is never overwritten. */
export const FORWARDER_MARKER = 'dshLegacyForwarder'

/**
 * Whether a TypeScript declaration file declares a default export.
 *
 * The Loader reads `exports.default ?? exports` to tell a service plugin from a
 * function plugin, so a forwarder that invents a default where the target has
 * none would misreport the plugin's form. `??` makes an undefined default
 * harmless there, but the client bundler and the package gates read the same
 * namespace, so the forwarder states only what the target actually exports.
 * @param declaration - contents of the subpath's `.d.ts`.
 * @returns true when the target has a default export.
 */
export function declaresDefaultExport(declaration: string): boolean {
  return /^export\s+default\s/mu.test(declaration)
    || /^export\s*\{[^}]*\bdefault\b[^}]*\}/mu.test(declaration)
}

/** One entry point a forwarder package republishes. */
export interface ForwardedSubpath {
  /** The subpath as the target's `exports` names it, e.g. `.` or `./client`. */
  subpath: string
  /** Whether the target's module at this subpath has a default export. */
  hasDefault: boolean
}

/**
 * The file name a forwarder uses for one subpath.
 * @param subpath - the exports-map key.
 * @returns a flat file name unique within the forwarder.
 */
function fileNameFor(subpath: string): string {
  if (subpath === '.') return 'index.js'
  return `${subpath.slice(2).replaceAll('/', '-')}.js`
}

/**
 * Whether a subpath can be forwarded by a static re-export.
 *
 * Wildcards cannot: `./src/*` maps a pattern, and a forwarder file would have
 * to exist per match. They are this repository's source-plane exports, read by
 * its own tsconfig paths and gates rather than by an installed plugin, so
 * omitting them costs an out-of-tree consumer nothing.
 *
 * `./client` cannot either, and for a harder reason. That subpath is not a
 * module anyone imports: it is a bundle the module server SERVES, and it
 * registers itself by calling `window.__ModuleLoader__.load({ id, factory })`
 * with the id baked in at bundle time. A re-export of it exports the target's
 * names and never runs that call, so a browser handed the forwarder loads a
 * script that registers nothing — and the boot fails reporting that the HTML
 * did not preload the bundle it just fetched. The client half is reached
 * through the module table, which does its own upstream-name mapping.
 * @param subpath - the exports-map key.
 * @returns true when a re-export file can stand in for it.
 */
export function forwardable(subpath: string): boolean {
  return !subpath.includes('*') && subpath !== './package.json' && subpath !== './client'
}

/**
 * The files of a forwarder package, as a path-to-contents map.
 *
 * Pure so the generated text is asserted directly rather than through the
 * filesystem.
 * @param legacyName - the upstream name this package answers to.
 * @param targetName - the product package it forwards to.
 * @param subpaths - the entry points to republish.
 * @returns file paths relative to the forwarder directory, and their contents.
 */
export function forwarderFiles(
  legacyName: string,
  targetName: string,
  subpaths: readonly ForwardedSubpath[],
): Map<string, string> {
  const files = new Map<string, string>()
  const exports: Record<string, unknown> = {}
  for (const { subpath, hasDefault } of subpaths) {
    if (!forwardable(subpath)) continue
    const file = fileNameFor(subpath)
    const from = JSON.stringify(subpath === '.' ? targetName : `${targetName}${subpath.slice(1)}`)
    const lines = [`export * from ${from}`]
    // `export *` never re-exports a default; a target that has one needs it
    // named explicitly or consumers importing the plugin class get nothing.
    if (hasDefault) lines.push(`export { default } from ${from}`)
    files.set(file, lines.join('\n') + '\n')
    exports[subpath] = `./${file}`
  }
  exports['./package.json'] = './package.json'
  const manifest = {
    name: legacyName,
    version: '0.0.0',
    private: true,
    type: 'module',
    main: './index.js',
    exports,
    dependencies: { [targetName]: '*' },
    [FORWARDER_MARKER]: true,
  }
  files.set('package.json', JSON.stringify(manifest, undefined, 2) + '\n')
  return files
}
