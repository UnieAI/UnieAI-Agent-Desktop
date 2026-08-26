/** Verify every compiled companion through its staged package self-reference under plain Node. */

import {
  copyFileSync,
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const repositoryRoot = resolve(import.meta.dirname, '..')
const { values: options } = parseArgs({
  args: process.argv.slice(2),
  options: { 'packages-root': { type: 'string' }, 'loader-url': { type: 'string' } },
})
const packagesRoot = resolve(options['packages-root'] ?? repositoryRoot)
const loaderUrl = options['loader-url']
  ?? pathToFileURL(resolve(repositoryRoot, 'vendor/loader/lib/index.js')).href
const failures = []
const manifests = globSync('packages/*/*/package.json', { cwd: packagesRoot }).sort()
const { default: Loader } = await import(loaderUrl)
const loader = Object.create(Loader.prototype)

for (const manifestPath of manifests) {
  const packageDir = dirname(resolve(packagesRoot, manifestPath))
  const manifest = JSON.parse(readFileSync(resolve(packagesRoot, manifestPath), 'utf8'))
  const packageName = manifest.name
  if (typeof packageName !== 'string' || packageName.length === 0) {
    failures.push(`${manifestPath}: missing package name`)
    continue
  }
  const invariantExport = manifest.exports?.['./invariant']
  if (typeof invariantExport !== 'object'
    || invariantExport.default !== './lib/invariant.js'
    || !manifest.files?.includes('lib/invariant.js')) {
    failures.push(`${packageName}: manifest does not publish ./lib/invariant.js as ./invariant`)
    continue
  }

  // Keep the staged view below its owning package so Node reaches the real
  // pnpm dependency links. Junctioning node_modules elsewhere breaks pnpm's
  // relative workspace links on Windows. Copy the manifest-declared lib view
  // so a companion that imports an undeclared runtime chunk fails here.
  const stagedPackageDir = mkdtempSync(resolve(packageDir, '.dsh-built-invariant-'))
  try {
    copyFileSync(resolve(packageDir, 'package.json'), resolve(stagedPackageDir, 'package.json'))
    copyDeclaredLibFiles(packageDir, stagedPackageDir, manifest.files)
    const probePath = resolve(stagedPackageDir, 'probe.mjs')
    writeFileSync(
      probePath,
      `import * as companion from ${JSON.stringify(`${packageName}/invariant`)}\nexport default companion\n`,
    )
    const { default: companion } = await import(pathToFileURL(probePath).href)
    if ('default' in companion) throw new Error('companion has a default export')
    const unwrapped = loader.unwrapExports(companion)
    if (unwrapped !== companion) throw new Error('Loader collapsed the companion namespace')
    if (typeof unwrapped.name !== 'string') throw new Error('companion name is missing')
    if (!Array.isArray(unwrapped.inject) || !unwrapped.inject.includes('invariants')) {
      throw new Error('companion does not inject invariants')
    }
    if (typeof unwrapped.apply !== 'function') throw new Error('companion apply is missing')

    // Every OTHER `./lib/*.js` subpath the manifest offers, checked against
    // the SAME staged view. A subpath is a promise to whoever installs the
    // package, and the build only emits what a tsdown entry names:
    // `@unieai/uad-browser-operator` shipped `./chromium` for a bundle no
    // config produced, and the desktop app died at boot on `Cannot find
    // module .../lib/chromium.js` while every test here stayed green, because
    // tests resolve `src`. Read rather than imported: some subpaths are CLI
    // entries that run on import.
    for (const [subpath, target] of libSubpaths(manifest.exports)) {
      if (subpath === './invariant') continue
      const staged = resolve(stagedPackageDir, target.slice(2))
      if (!existsSync(staged)) {
        throw new Error(`subpath ${subpath} promises ${target}, which the build does not publish`)
      }
      for (const relative of relativeImportsOf(readFileSync(staged, 'utf8'))) {
        if (existsSync(resolve(dirname(staged), relative))) continue
        throw new Error(`subpath ${subpath} imports ${relative}, which files does not publish`)
      }
    }
  } catch (error) {
    failures.push(`${packageName}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    rmSync(stagedPackageDir, { recursive: true, force: true })
  }
}

if (failures.length > 0) {
  console.error('verify-built-package-invariants: compiled companion failures:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`verify-built-package-invariants: ${manifests.length} compiled companion(s) passed plain-Node Loader checks.`)

/**
 * Every export subpath whose runtime target is a built `lib/*.js` file.
 * `lib/types/*.js` is unbundled tsc output rather than a build entry, and a
 * non-JavaScript target (a `cordis.patch.yml`) is not importable.
 * @param exportsField - the manifest's `exports` object.
 * @returns `[subpath, target]` pairs, excluding the root and wildcards.
 */
function libSubpaths(exportsField) {
  const pairs = []
  for (const [subpath, value] of Object.entries(exportsField ?? {})) {
    if (subpath === '.' || subpath.includes('*')) continue
    const target = typeof value === 'string' ? value : value?.default
    if (typeof target !== 'string') continue
    if (!/^\.\/lib\/[^/]+\.js$/.test(target)) continue
    pairs.push([subpath, target])
  }
  return pairs
}

/**
 * Relative specifiers one bundle imports, so a shared chunk left out of
 * `files` is a failure here rather than at someone's first run.
 *
 * Only `.js`/`.mjs`/`.cjs` targets count. Built output always carries the
 * extension, while `import('./x.ts')` appears inside generated STRINGS —
 * cordis-client-runner embeds type descriptors that read as imports — and a
 * scan without this bound reports those as missing files.
 * @param source - the bundle's JavaScript text.
 * @returns each relative specifier, once.
 */
function relativeImportsOf(source) {
  const found = new Set()
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']*\.[cm]?js)["']/g)) {
    found.add(match[1])
  }
  return found
}

function copyDeclaredLibFiles(packageDir, stagedPackageDir, files) {
  for (const pattern of files) {
    if (!pattern.startsWith('lib/')) continue
    for (const relativePath of globSync(pattern, { cwd: packageDir })) {
      const source = resolve(packageDir, relativePath)
      if (!existsSync(source)) continue
      const target = resolve(stagedPackageDir, relativePath)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(source, target, { recursive: true })
    }
  }
}
