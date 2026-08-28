/**
 * Every JavaScript file a package's build emits into `lib/` is published.
 *
 * A package's `files` list names what ships. The build decides what exists, and
 * the two are written in different places by different people — so a build that
 * starts emitting a file the list does not name produces a package whose own
 * entry cannot be imported. `@unieai/uad-execution-router` shipped exactly that
 * in 0.1.13 and 0.1.14: rolldown split the module its four entries share into
 * `lib/types-<hash>.js`, a hashed name no `files` list can express, and an
 * installed tree died on
 * `ERR_MODULE_NOT_FOUND … lib/types-Dc6T3R7E.js imported from lib/fs.js`.
 *
 * NOTHING ELSE CATCHES THIS. Tests resolve `src` through tsconfig paths, so
 * they never read `lib/`. The packed-install probe installs the tarballs and
 * runs `--version`, which loads one entry and returns before reaching a routed
 * seam. `publint` reads the manifest, not the emitted tree. The failure is
 * invisible in this repository and total in an installed one.
 *
 * This checks the artifact plane, so it needs a build: run it after
 * `pnpm run build`, which the release pack step already requires.
 *
 * Run: `tsx scripts/verify-published-emitted-files.ts`
 */

import { globSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** What this check reads from a package manifest. */
interface Manifest {
  readonly name?: string
  readonly private?: boolean
  readonly files?: readonly string[]
}

/**
 * Whether one `files` pattern publishes a path.
 *
 * npm's `files` entries are gitignore-style: a bare directory publishes its
 * whole tree, and `*` does not cross a `/`. Only the shapes this repository
 * actually writes are supported, and anything else is treated as no match —
 * a false "unpublished" is a loud gate failure someone reads, while a false
 * "published" is the silence this exists to end.
 * @param pattern - one `files` entry.
 * @param path - a package-relative path such as `lib/fs.js`.
 * @returns whether the pattern publishes that path.
 */
export function publishes(pattern: string, path: string): boolean {
  const normalized = pattern.replace(/^\.\//u, '').replace(/\/$/u, '')
  if (normalized === path) return true
  // A directory entry publishes everything under it.
  if (!normalized.includes('*') && path.startsWith(`${normalized}/`)) return true
  if (!normalized.includes('*')) return false
  const expression = normalized
    .split('**')
    .map(part => part.split('*').map(segment => segment.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`)).join('[^/]*'))
    .join('.*')
  return new RegExp(`^${expression}$`, 'u').test(path)
}

/** Every `.js` file under one package's `lib/`, package-relative. */
function emittedJs(packageDir: string): string[] {
  const lib = join(packageDir, 'lib')
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      // `lib/types/` holds the TypeScript emit the bundler reads, not shipped
      // runtime; the manifests publish its declarations only.
      else if (entry.isFile() && entry.name.endsWith('.js') && !full.includes(`${join('lib', 'types')}/`)) {
        out.push(relative(packageDir, full).replaceAll('\\', '/'))
      }
    }
  }
  try {
    walk(lib)
  } catch {
    // No lib/: a package that has not been built, or ships no runtime.
    return []
  }
  return out
}

function main(): void {
  const manifests = [
    ...globSync('packages/*/*/package.json', { cwd: root }),
    ...globSync('apps/*/package.json', { cwd: root }),
    ...globSync('vendor/*/package.json', { cwd: root }),
  ]

  const problems: string[] = []
  let checked = 0
  for (const relativeManifest of manifests) {
    const packageDir = join(root, relativeManifest, '..')
    const manifest = JSON.parse(readFileSync(join(root, relativeManifest), 'utf8')) as Manifest
    if (manifest.private === true || manifest.files === undefined) continue
    if (!statSync(join(packageDir, 'lib'), { throwIfNoEntry: false })?.isDirectory()) continue
    checked += 1
    for (const file of emittedJs(packageDir)) {
      if (manifest.files.some(pattern => publishes(pattern, file))) continue
      problems.push(`${manifest.name ?? relativeManifest}: builds ${file}, which "files" does not publish`)
    }
  }

  if (problems.length > 0) {
    console.error('These packages emit runtime files their manifests leave behind:\n')
    for (const problem of problems) console.error(`  ${problem}`)
    console.error(
      '\nAn unpublished emit is an installed package that cannot import its own entry.'
      + '\nEither name the file in "files" (give a bundler chunk a fixed name first —'
      + '\na content hash cannot be named), or stop emitting it.',
    )
    process.exit(1)
  }
  console.log(`verify-published-emitted-files: ${String(checked)} built package(s), every emitted runtime file is published.`)
}

main()
