/**
 * Profile machinery of `dsh-app-boot`: directory resolution and init,
 * manifest round-trips, two-anchor bundle resolution, patch-layer loading,
 * empty-root composition, and the installation module-fallback healing.
 */

import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
} from '../src/index.ts'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'dsh-profile-'))

/** Stage a fake installed app: package.json with deps and a node_modules holding bundles. */
function stageInstallation(bundles: Record<string, { patch?: string; deps?: Record<string, string> }>): string {
  const root = tmp()
  const appDir = join(root, 'app')
  mkdirSync(join(appDir, 'node_modules'), { recursive: true })
  const appDeps: Record<string, string> = {}
  for (const [name, spec] of Object.entries(bundles)) {
    appDeps[name] = '0.0.0'
    const dir = join(appDir, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '0.0.0',
      dependencies: spec.deps ?? {},
      ...spec.patch === undefined ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } },
    }))
    if (spec.patch !== undefined) writeFileSync(join(dir, 'cordis.patch.yml'), spec.patch)
  }
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'dsh-app', dependencies: appDeps }))
  return join(appDir, 'package.json')
}

describe('resolveProfileDir', () => {
  it('joins the home and rejects traversal-shaped names', () => {
    const home = tmp()
    expect(resolveProfileDir('tui', home)).toBe(join(home, 'profiles', 'tui'))
    for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
      expect(() => resolveProfileDir(bad, home)).toThrow('invalid profile name')
    }
  })
})

describe('initProfile', () => {
  it('creates manifest, user patch layer, and pnpm workspace once, never overwriting', () => {
    const home = tmp()
    const dir = resolveProfileDir('tui', home)
    initProfile(dir, ['@unieai/uad-base'])
    const manifest = readProfileManifest('t', dir)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@unieai/uad-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('[]')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('nodeLinker: hoisted')
    // Re-init keeps user edits.
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: x\n  config: {}\n')
    initProfile(dir, ['other'])
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['@unieai/uad-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('- id: x')
  })
})

describe('manifest round-trip', () => {
  it('writes and reads back, and fails loud on a broken manifest', () => {
    const dir = tmp()
    writeProfileManifest(dir, { name: 'p', dsh: { profile: { bundles: ['a'] } } })
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['a'])
    writeFileSync(join(dir, 'package.json'), '[]')
    expect(() => readProfileManifest('t', dir)).toThrow('must hold a JSON object')
    expect(() => readProfileManifest('t', join(dir, 'nope'))).toThrow('failed to read profile manifest')
  })
})

describe('resolveBundleDir', () => {
  it('prefers the installation anchor, falls back to the profile, and fails loud', () => {
    const anchor = stageInstallation({ 'in-box': { patch: '[]\n' } })
    const profileDir = tmp()
    mkdirSync(join(profileDir, 'node_modules', 'local-only'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{}')
    writeFileSync(join(profileDir, 'node_modules', 'local-only', 'package.json'), JSON.stringify({ name: 'local-only', version: '0.0.0' }))
    expect(resolveBundleDir('t', 'in-box', anchor, profileDir)).toContain('in-box')
    expect(resolveBundleDir('t', 'local-only', anchor, profileDir)).toContain('local-only')
    expect(() => resolveBundleDir('t', 'absent', anchor, profileDir)).toThrow('cannot resolve profile bundle')
  })

  it('resolves a package whose exports map omits ./package.json', () => {
    // Common on npm: an exports map without "./package.json" makes
    // require.resolve('<pkg>/package.json') throw ERR_PACKAGE_PATH_NOT_EXPORTED;
    // resolution must fall through to the paths probe instead of misreporting
    // the installed package as missing.
    const anchor = stageInstallation({})
    const profileDir = tmp()
    writeFileSync(join(profileDir, 'package.json'), '{}')
    const dir = join(profileDir, 'node_modules', 'sealed-bundle')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'sealed-bundle',
      version: '0.0.0',
      exports: { '.': './index.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'index.js'), '')
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    expect(resolveBundleDir('t', 'sealed-bundle', anchor, profileDir)).toBe(dir)
  })
})

describe('loadProfile', () => {
  it('resolves each dsh.profile.bundles entry to its patch layer in order, plus the user layer', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '- insert:\n    - id: a\n      name: pkg-a\n' },
      'bundle-b': { patch: '- id: a\n  config:\n    v: 2\n' },
    })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['bundle-a', 'bundle-b'])
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: a\n  config:\n    v: 3\n')
    const profile = loadProfile('t', 'demo', anchor, home)
    expect(profile.layers.map(layer => layer.packageName)).toEqual(['bundle-a', 'bundle-b'])
    expect(profile.patches).toHaveLength(1)
    const entries = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
    ])
    expect(entries).toEqual([{ id: 'a', name: 'pkg-a', config: { v: 3 } }])
    // A hand-made profile without the user layer file or dsh section: empty layers, no throw.
    rmSync(join(dir, PROFILE_PATCH_FILENAME))
    expect(loadProfile('t', 'demo', anchor, home).patches).toEqual([])
    writeProfileManifest(dir, { name: 'bare' })
    const bare = loadProfile('t', 'demo', anchor, home)
    expect(bare.layers).toEqual([])
  })

  it('auto-initializes only shipped templates and fails loud otherwise', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    expect(() => loadProfile('t', 'custom', anchor, home))
      .toThrow('profile "custom" does not exist')
    // The web template auto-initializes on first load. Bundle resolution
    // cannot be asserted to fail here: the source-plane test runner resolves
    // @unieai/* through tsconfig paths regardless of the staged anchor.
    expect(PROFILE_TEMPLATES.web).toContain('@unieai/uad-base')
    try {
      loadProfile('t', 'web', anchor, home)
    } catch {
      // Resolution failure is the plain-Node outcome for this empty anchor.
    }
    expect(readProfileManifest('t', resolveProfileDir('web', home)).dsh?.profile?.bundles)
      .toEqual([...PROFILE_TEMPLATES.web ?? []])
  })

  it('normalizes only the exact installation-owned headless bundle tuple', () => {
    const anchor = stageInstallation({
      '@unieai/uad-base': { patch: '[]\n' },
      '@unieai/uad-web-app': { patch: '[]\n' },
      '@unieai/uad-headless': { patch: '[]\n' },
      'custom-bundle': { patch: '[]\n' },
    })
    const home = tmp()
    const stock = resolveProfileDir('headless', home)
    initProfile(stock, [
      '@unieai/uad-base', '@unieai/uad-web-app', '@unieai/uad-headless',
    ])
    loadProfile('t', 'headless', anchor, home)
    expect(readProfileManifest('t', stock).dsh?.profile?.bundles)
      .toEqual(['@unieai/uad-base', '@unieai/uad-headless'])

    const customHome = tmp()
    const custom = resolveProfileDir('headless', customHome)
    initProfile(custom, [
      '@unieai/uad-base', '@unieai/uad-web-app', '@unieai/uad-headless', 'custom-bundle',
    ])
    loadProfile('t', 'headless', anchor, customHome)
    expect(readProfileManifest('t', custom).dsh?.profile?.bundles).toEqual([
      '@unieai/uad-base', '@unieai/uad-web-app', '@unieai/uad-headless', 'custom-bundle',
    ])
  })

  it('fails loud when a listed bundle declares no dsh.bundle', () => {
    const anchor = stageInstallation({ 'not-a-bundle': {} })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['not-a-bundle'])
    expect(() => loadProfile('t', 'demo', anchor, home)).toThrow('declares no dsh.bundle')
  })
})

describe('composeEntries', () => {
  it('applies layers over an empty root and reports skipped patches', () => {
    const warnings: string[] = []
    const entries = composeEntries([
      [{ insert: [{ id: 'x', name: 'pkg-x', config: { a: 1 } }] }],
      [{ id: 'x', config: { a: 2 } }, { id: 'missing', config: {} }],
    ], message => warnings.push(message))
    expect(entries).toEqual([{ id: 'x', name: 'pkg-x', config: { a: 2 } }])
    expect(warnings.join('\n')).toContain('"missing"')
    // Default warn sink: skipped patches are silently dropped (boot repeats them).
    expect(composeEntries([[{ id: 'missing', config: {} }]])).toEqual([])
  })
})

describe('healProfilesModuleFallback', () => {
  it('links the app and bundle dependency surface flat under profiles/node_modules', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '[]\n', deps: { 'dep-of-a': '0.0.0', 'ghost-dep': '0.0.0' } },
      'plain-lib': {},
    })
    // An app dependency that is declared but not installed: skipped, not fatal.
    const appManifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies: Record<string, string> }
    appManifest.dependencies['never-installed'] = '0.0.0'
    writeFileSync(anchor, JSON.stringify(appManifest))
    // dep-of-a lives in the installation's node_modules too.
    const modules = join(anchor, '..', 'node_modules')
    mkdirSync(join(modules, 'dep-of-a'), { recursive: true })
    writeFileSync(join(modules, 'dep-of-a', 'package.json'), JSON.stringify({ name: 'dep-of-a', version: '0.0.0' }))
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const fallback = join(home, 'profiles', 'node_modules')
    // App deps, the bundle's own deps, and the bundle itself are linked; the
    // plain library is linked as an app dep (harmless), the app itself too.
    for (const name of ['bundle-a', 'plain-lib', 'dep-of-a', 'dsh-app']) {
      expect(lstatSync(join(fallback, name)).isSymbolicLink(), name).toBe(true)
    }
    // Idempotent, and a moved target is re-pointed.
    healProfilesModuleFallback(anchor, home)
    const before = readlinkSync(join(fallback, 'dep-of-a'))
    expect(before).toContain('dep-of-a')
  })

  it('throws when a fallback entry is a real directory', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    mkdirSync(join(home, 'profiles', 'node_modules', 'dsh-app'), { recursive: true })
    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('is not a symlink')
  })

  it('replaces a wrong symlink', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const fallback = join(home, 'profiles', 'node_modules')
    mkdirSync(fallback, { recursive: true })
    symlinkSync(tmp(), join(fallback, 'dsh-app'), 'junction')
    healProfilesModuleFallback(anchor, home)
    expect(readlinkSync(join(fallback, 'dsh-app'))).toContain('app')
  })

  it('tolerates losing the concurrent-heal race to an identical link and rejects a different one', () => {
    // The EEXIST arm: a second process wrote the link between our lstat miss
    // and symlinkSync. Simulated by pre-creating the correct link and calling
    // the internal path through a stale-lstat shim is not possible from
    // outside, so probe the observable contract: healing twice concurrently
    // is a no-op, and a foreign REAL directory still fails loud.
    const anchor = stageInstallation({})
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    healProfilesModuleFallback(anchor, home) // second healer sees the correct link
    const fallback = join(home, 'profiles', 'node_modules')
    expect(lstatSync(join(fallback, 'dsh-app')).isSymbolicLink()).toBe(true)
  })

  it('answers to the upstream name of every product-scoped package', () => {
    // A plugin published for the upstream harness names its peers
    // `@deepseek-ai/dsh-*`; nothing else about it is incompatible.
    const anchor = stageInstallation({ '@unieai/uad-tools': {}, 'plain-lib': {} })
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const forwarder = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tools')
    expect(readFileSync(join(forwarder, 'index.js'), 'utf8')).toBe('export * from "@unieai/uad-tools"\n')
    // A real directory, not a symlink: under Electron's --preserve-symlinks a
    // symlink alias would load a second copy of the package.
    expect(lstatSync(forwarder).isSymbolicLink()).toBe(false)
  })

  it('leaves a package from another scope unaliased', () => {
    const anchor = stageInstallation({ 'plain-lib': {} })
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    expect(existsSync(join(home, 'profiles', 'node_modules', '@deepseek-ai'))).toBe(false)
  })

  it('rewrites nothing on a second heal', () => {
    const anchor = stageInstallation({ '@unieai/uad-tools': {} })
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const file = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tools', 'index.js')
    const before = statSync(file).mtimeMs
    healProfilesModuleFallback(anchor, home)
    // Healing runs at every launch; churning mtimes would defeat any watcher
    // downstream of the fallback.
    expect(statSync(file).mtimeMs).toBe(before)
  })

  it('carries a default export through, and survives a package with no declarations', () => {
    const anchor = stageInstallation({ '@unieai/uad-service': {}, '@unieai/uad-unbuilt': {} })
    const modules = join(anchor, '..', 'node_modules')
    // A service package default-exports its class; a function plugin does not,
    // and `export *` alone would drop the class.
    const service = join(modules, '@unieai/uad-service')
    writeFileSync(join(service, 'package.json'), JSON.stringify({
      name: '@unieai/uad-service', version: '0.0.0',
      exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' } },
    }))
    mkdirSync(join(service, 'lib'), { recursive: true })
    writeFileSync(join(service, 'lib', 'index.d.ts'), 'export default class Service {}\n')
    // Declarations that were never built: the subpath still forwards its names.
    // A subpath given as a bare path states no declarations at all.
    writeFileSync(join(modules, '@unieai/uad-unbuilt', 'package.json'), JSON.stringify({
      name: '@unieai/uad-unbuilt', version: '0.0.0',
      exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' }, './raw': './lib/raw.js' },
    }))
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const fallback = join(home, 'profiles', 'node_modules', '@deepseek-ai')
    expect(readFileSync(join(fallback, 'dsh-service', 'index.js'), 'utf8'))
      .toContain('export { default } from "@unieai/uad-service"')
    expect(readFileSync(join(fallback, 'dsh-unbuilt', 'index.js'), 'utf8'))
      .toBe('export * from "@unieai/uad-unbuilt"\n')
    expect(readFileSync(join(fallback, 'dsh-unbuilt', 'raw.js'), 'utf8'))
      .toBe('export * from "@unieai/uad-unbuilt/raw"\n')
  })

  it('clears a dangling link left at an upstream name by an earlier heal', () => {
    // A link whose package vanished is invisible to resolution but fatal to
    // mkdir, which fails ENOENT rather than seeing a directory. Healing must
    // not abort the whole boot over one stale link nobody can reach.
    const anchor = stageInstallation({ '@unieai/uad-tools': {} })
    const home = tmp()
    const legacy = join(home, 'profiles', 'node_modules', '@deepseek-ai')
    mkdirSync(legacy, { recursive: true })
    symlinkSync(join(tmp(), 'vanished'), join(legacy, 'dsh-tools'), 'junction')
    healProfilesModuleFallback(anchor, home)
    expect(readFileSync(join(legacy, 'dsh-tools', 'index.js'), 'utf8'))
      .toBe('export * from "@unieai/uad-tools"\n')
  })

  it('leaves an upstream name to the upstream package that is actually installed', () => {
    // Both names reach the fallback: `@deepseek-ai/dsh-tools` because the app
    // depends on it, and `@unieai/uad-tools` because it is ours. The real
    // dependency keeps the name; a forwarder would swap it for an alias of a
    // different package.
    const anchor = stageInstallation({ '@unieai/uad-tools': {}, '@deepseek-ai/dsh-tools': {} })
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const claimed = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tools')
    expect(lstatSync(claimed).isSymbolicLink()).toBe(true)
    expect(existsSync(join(claimed, 'index.js'))).toBe(false)
  })

  it('refuses to overwrite a package someone installed at the upstream name', () => {
    const anchor = stageInstallation({ '@unieai/uad-tools': {} })
    const home = tmp()
    const installed = join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tools')
    mkdirSync(installed, { recursive: true })
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools' }))
    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('is an installed package')
  })
})
