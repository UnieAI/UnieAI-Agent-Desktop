/**
 * Re-vendor `vendor/genui/` from a published `@changfenhuang/dsh-genui` release.
 *
 * The package is vendored rather than depended on because its manifest declares
 * thirteen `@deepseek-ai/*` PEER dependencies, and npm and bun both install
 * missing peers — so depending on it downloads a second complete harness beside
 * ours, and the closure walk then links it over the forwarders that make the
 * plugin resolve OUR packages
 * ([why](../.agents/notes/implemented/architecture/2026-08-28-peer-installed-upstream-duplicates.md)).
 *
 * Vendoring it means one mechanical rewrite, which this script owns so the next
 * sync costs a command instead of a re-derivation. It rewrites the copy only;
 * `vendor/genui/package.json` is OURS and is never touched.
 *
 * TWO OF THESE REWRITES ARE LOAD-BEARING, not cosmetic. The host serves the
 * lazily fetched mermaid/three/echarts bundles at `ASSET_ROUTE_PATH` and the
 * client fetches them from `PLUGIN_ID`; the two constants live in different
 * faces and upstream spells the package name into each. Rescope one and not the
 * other and every heavy renderer 404s at run time, with the fence still drawing
 * its light half — a silent partial failure. They are asserted below rather than
 * left to the general token pass.
 *
 * Usage: `pnpm run sync-vendor-genui <version>` (e.g. `0.9.6`), then rebuild
 * (`pnpm --dir vendor/genui exec tsdown`) and update the manifest row and
 * version in [vendor/README.md](../vendor/README.md).
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'vendor', 'genui')

/** Upstream package this directory is a copy of. */
const UPSTREAM = '@changfenhuang/dsh-genui'

/** What the vendored copy is published as here. */
const SCOPED = '@unieai/genui'

/** Files taken verbatim from the upstream tarball, beside `src/`. */
const COPIED_FILES = ['LICENSE', 'README.md', 'SKILL.md', 'cordis.patch.yml', 'tsdown.config.ts'] as const

/** Extensions the token rewrite reads. */
const REWRITTEN = ['.ts', '.tsx', '.yml', '.md']

/**
 * The two strings that must name the same package on both sides of the network.
 * Each is asserted to appear after the rewrite, so an upstream refactor that
 * moves or renames one fails this script instead of shipping a half-working
 * renderer.
 */
const LOAD_BEARING = [
  { file: 'src/plugin/index.ts', text: `const ASSET_ROUTE_PATH = '/plugins/${SCOPED}/assets'` },
  { file: 'src/client/asset-loader.ts', text: `const PLUGIN_ID = '${SCOPED}'` },
] as const

/**
 * This product's name for an upstream harness package.
 * @param name - a `@deepseek-ai/*` package name.
 * @returns the `@unieai/*` name it is published as here.
 */
function productNameFor(name: string): string {
  const bare = name.slice('@deepseek-ai/'.length)
  return bare.startsWith('dsh-') ? `@unieai/uad-${bare.slice('dsh-'.length)}` : `@unieai/${bare}`
}

/**
 * Rewrite every upstream name in one file's text.
 * @param text - the file contents.
 * @returns the rewritten contents.
 */
function rescope(text: string): string {
  return text
    .replaceAll(/@deepseek-ai\/[A-Za-z0-9._-]+/gu, name => productNameFor(name))
    // The package's own name: as a quoted specifier, inside the asset route,
    // and in `@module` tags and prose that name what is published here.
    .replaceAll(UPSTREAM, SCOPED)
}

/**
 * Every file under `dir`, recursively.
 *
 * Reads directory entry types rather than following links: `vendor/genui`
 * holds a `node_modules` of symlinked workspace packages, and a link-following
 * walk loops through it forever.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function main(): void {
  const version = process.argv[2]
  if (version === undefined || !/^\d+\.\d+\.\d+/u.test(version)) {
    throw new Error('usage: sync-vendor-genui <version>   (e.g. 0.9.6)')
  }

  const staging = mkdtempSync(join(tmpdir(), 'vendor-genui-'))
  try {
    execFileSync('npm', ['pack', `${UPSTREAM}@${version}`, '--silent'], { cwd: staging, stdio: 'inherit' })
    const tarball = readdirSync(staging).find(name => name.endsWith('.tgz'))
    if (tarball === undefined) throw new Error(`npm pack produced no tarball for ${UPSTREAM}@${version}`)
    execFileSync('tar', ['-xzf', tarball], { cwd: staging, stdio: 'inherit' })
    const unpacked = join(staging, 'package')

    // The copy is replaced wholesale rather than merged: a file upstream
    // deleted must not survive here as a phantom that still compiles.
    rmSync(join(target, 'src'), { recursive: true, force: true })
    cpSync(join(unpacked, 'src'), join(target, 'src'), { recursive: true })
    for (const file of COPIED_FILES) cpSync(join(unpacked, file), join(target, file))

    let rewritten = 0
    const vendored = [...walk(join(target, 'src')), ...COPIED_FILES.map(file => join(target, file))]
    for (const file of vendored) {
      if (!REWRITTEN.some(extension => file.endsWith(extension))) continue
      const before = readFileSync(file, 'utf8')
      const after = rescope(before)
      if (after === before) continue
      writeFileSync(file, after)
      rewritten += 1
    }

    for (const { file, text } of LOAD_BEARING) {
      const contents = readFileSync(join(target, file), 'utf8')
      if (!contents.includes(text)) {
        throw new Error(
          `sync-vendor-genui: ${file} no longer contains ${JSON.stringify(text)} after the rewrite. `
          + 'The host route and the client plugin id must spell the same package, or the lazily '
          + 'fetched mermaid/three/echarts bundles 404 at run time. Re-read both faces upstream.',
        )
      }
    }

    // Upstream's README documents installing the upstream package; the copy
    // says what it is before repeating that text.
    const readmePath = join(target, 'README.md')
    const readme = readFileSync(readmePath, 'utf8')
    writeFileSync(
      readmePath,
      `> **Vendored copy.** This is \`${UPSTREAM}\` ${version} (MIT, https://github.com/omdsh-dev/dsh-genui), `
      + `pinned as source and republished as \`${SCOPED}\` with its imports rescoped to this fork's package names. `
      + "Upstream's text follows unchanged; the divergences are logged in [vendor/README.md](../README.md).\n\n"
      + readme,
    )

    console.log(`sync-vendor-genui: vendored ${UPSTREAM}@${version}; ${String(rewritten)} file(s) rescoped.`)
    console.log('sync-vendor-genui: next — rebuild, then update the manifest row and version in vendor/README.md.')
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

main()
