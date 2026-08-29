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
