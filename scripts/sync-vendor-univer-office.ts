/**
 * Re-vendor `vendor/univer-office/` from a published `dsh-univer-office`
 * release, carrying this fork's one behavioural divergence forward.
 *
 * WHY IT IS VENDORED. The plugin declares eight `@deepseek-ai/*` PEER
 * dependencies, and npm and bun both install missing peers — so depending on it
 * downloads a second complete harness
 * ([why](../.agents/notes/implemented/architecture/2026-08-28-peer-installed-upstream-duplicates.md)).
 * Unlike `genui`, its own bundles need no rescoping: the host half imports the
 * upstream names and the manifest answers them with npm aliases onto our
 * packages, so nothing but `package.json` decides where they resolve.
 *
 * WHAT THIS FORK CHANGES. Upstream floats its Viewer windows over the
 * conversation. Here they are docked in the shell's right column, which the
 * layout owns (`ctx.layout.openDocument()`), because a document is a place to
 * work rather than a thing to drag out of the way. That is a source change, so
 * the changed files live under `vendor/univer-office/patch/` and this script
 * overlays them onto a clean upstream checkout and rebuilds — the divergence is
 * a diff anyone can read, not a memory.
 *
 * The rebuilt bundles replace `lib/`; `artifacts/` (the prebuilt Gateway,
 * Viewer, render machine and worker — about 143 MB) is taken from the published
 * tarball untouched.
 *
 * Usage: `pnpm run sync-vendor-univer-office <version>` (e.g. `0.2.11`), then
 * update the manifest row and version in [vendor/README.md](../vendor/README.md).
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'vendor', 'univer-office')

/** Upstream package this directory is a copy of. */
const UPSTREAM = 'dsh-univer-office'

/** What the vendored copy is published as here. */
const SCOPED = '@unieai/univer-office'

/** Upstream source of record, cloned to rebuild `lib/` with our patch applied. */
const REPOSITORY = 'https://github.com/dream-num/dsh-univer-office.git'

/** Taken from the published tarball as-is. */
const COPIED_FROM_TARBALL = ['artifacts', 'skills', 'docs', 'cordis.patch.yml', 'README.md'] as const

/**
 * The module-loader id inside `lib/client.js`.
 *
 * LOAD-BEARING. The shell fetches a plugin's bundle by its package name and
 * refuses one that registers under a different id — the whole plugin system
 * fails to load, not just this plugin. Upstream's build writes its own name, so
 * every rebuild must be repointed at ours, and this script asserts the result.
 */
const LOADER_ID_LINE = `id: "${SCOPED}",`

/**
 * The plugin name inside `cordis.patch.yml`.
 *
 * LOAD-BEARING, and taken from the tarball, so every sync reverts it. The
 * patch file is what mounts this plugin into a composition; left at the
 * upstream name it names a package that does not exist here, and the entry
 * either fails to resolve or resolves to an upstream copy.
 */
const PATCH_NAME_LINE = `name: '${SCOPED}'`

/**
 * Upstream package names the built bundles import, and what they are here.
 *
 * LOAD-BEARING, and the reason is not the workspace. Inside this repository the
 * manifest's npm aliases answer these names, so a rescope looks unnecessary —
 * and it is, right up until the app is PACKAGED. electron-builder resolves a
 * dependency tree by copying it, and a `workspace:` alias has no directory to
 * copy: the build says `cannot find path for dependency` and ships anyway, and
 * the installed app dies on
 * `Cannot find package '@deepseek-ai/schemastery'` before the harness is ready.
 * A bundle that imports our names needs no alias to survive being copied.
 */
const RESCOPE: ReadonlyArray<readonly [string, string]> = [
  ['@deepseek-ai/cordis', '@unieai/cordis'],
  ['@deepseek-ai/schemastery', '@unieai/schemastery'],
  ['@deepseek-ai/dsh-attachment', '@unieai/uad-attachment'],
  ['@deepseek-ai/dsh-host-webserver', '@unieai/uad-host-webserver'],
  ['@deepseek-ai/dsh-llm', '@unieai/uad-llm'],
  ['@deepseek-ai/dsh-session', '@unieai/uad-session'],
  ['@deepseek-ai/dsh-skill', '@unieai/uad-skill'],
  ['@deepseek-ai/dsh-tools', '@unieai/uad-tools'],
]

/**
 * Rewrite every upstream import in one built bundle, and prove none survived.
 * @param file - the bundle to rewrite in place.
 */
function rescopeBundle(file: string): void {
  let text = readFileSync(file, 'utf8')
  for (const [upstream, ours] of RESCOPE) {
    text = text.replaceAll(`"${upstream}"`, `"${ours}"`).replaceAll(`'${upstream}'`, `'${ours}'`)
  }
  // Only a SPECIFIER matters: esbuild leaves `// node_modules/<pkg>/…` banner
  // comments for every module it inlined, and an inlined module is not
  // something the packaged tree has to resolve.
  const left = /["'](@deepseek-ai\/[a-z-]+)["']/u.exec(text)
  if (left !== null) {
    throw new Error(
      `sync-vendor-univer-office: ${file} still imports ${left[1] ?? ''} after the rescope. `
      + 'A packaged app cannot resolve an upstream name, so add it to RESCOPE with the package it is here.',
    )
  }
  writeFileSync(file, text)
}

/** Every file under `dir`, recursively, skipping links. */
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
    throw new Error('usage: sync-vendor-univer-office <version>   (e.g. 0.2.11)')
  }

  const staging = mkdtempSync(join(tmpdir(), 'vendor-univer-'))
  try {
    // The published tarball carries the prebuilt artifacts; the repository
    // carries the source that `lib/` is rebuilt from. Both are needed.
    execFileSync('npm', ['pack', `${UPSTREAM}@${version}`, '--silent'], { cwd: staging, stdio: 'inherit' })
    const tarball = readdirSync(staging).find(name => name.endsWith('.tgz'))
    if (tarball === undefined) throw new Error(`npm pack produced no tarball for ${UPSTREAM}@${version}`)
    execFileSync('tar', ['-xzf', tarball], { cwd: staging, stdio: 'inherit' })
    const unpacked = join(staging, 'package')

    const checkout = join(staging, 'src-checkout')
    execFileSync('git', ['clone', '--depth', '1', '--branch', `v${version}`, REPOSITORY, checkout], { stdio: 'inherit' })

    // Overlay this fork's changed sources, then build with upstream's own
    // script so the output shape stays theirs.
    const patch = join(target, 'patch')
    for (const file of walk(patch)) {
      cpSync(file, join(checkout, relative(patch, file)))
    }
    execFileSync('npm', ['install', 'esbuild', '--no-save', '--no-audit', '--no-fund'], { cwd: checkout, stdio: 'inherit' })
    execFileSync('node', ['scripts/build.mjs', 'lib'], { cwd: checkout, stdio: 'inherit' })

    rmSync(join(target, 'lib'), { recursive: true, force: true })
    cpSync(join(checkout, 'lib'), join(target, 'lib'), { recursive: true })
    for (const entry of COPIED_FROM_TARBALL) {
      rmSync(join(target, entry), { recursive: true, force: true })
      cpSync(join(unpacked, entry), join(target, entry), { recursive: true })
    }

    // Every file above came from upstream and spells upstream's name; the two
    // places that decide what this package IS have to be repointed at ours.
    const patchPath = join(target, 'cordis.patch.yml')
    const repointedPatch = readFileSync(patchPath, 'utf8').replace(`name: '${UPSTREAM}'`, PATCH_NAME_LINE)
    if (!repointedPatch.includes(PATCH_NAME_LINE)) {
      throw new Error(
        `sync-vendor-univer-office: cordis.patch.yml does not name ${SCOPED} after the rewrite. `
        + 'A patch file naming the upstream package mounts a plugin that is not vendored here. '
        + "Re-read the entry upstream writes and update this script's rewrite.",
      )
    }
    writeFileSync(patchPath, repointedPatch)

    // The bundles ship; the aliases that used to answer for them do not
    // survive packaging, so the names are rewritten here instead.
    for (const bundle of ['index.js', 'client.js']) rescopeBundle(join(target, 'lib', bundle))

    const clientPath = join(target, 'lib', 'client.js')
    const client = readFileSync(clientPath, 'utf8')
    const repointed = client.replace(`id: "${UPSTREAM}",`, LOADER_ID_LINE)
    if (!repointed.includes(LOADER_ID_LINE)) {
      throw new Error(
        `sync-vendor-univer-office: lib/client.js does not register under ${SCOPED} after the rewrite. `
        + 'The shell refuses a bundle whose id is not its package name, and the whole plugin system '
        + 'fails to load — not just this plugin. Re-read the module-loader wrapper upstream emits.',
      )
    }
    writeFileSync(clientPath, repointed)

    console.log(`sync-vendor-univer-office: vendored ${UPSTREAM}@${version} with this fork's docked-column patch.`)
    console.log('sync-vendor-univer-office: next — update the manifest row and version in vendor/README.md.')
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

main()
