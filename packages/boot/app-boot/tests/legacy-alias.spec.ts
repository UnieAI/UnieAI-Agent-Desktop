/**
 * What an upstream-named plugin resolves to, and why a forwarder is used
 * instead of a second symlink.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  declaresDefaultExport, FORWARDER_MARKER, forwarderFiles, forwardable,
} from '../src/legacy-alias.ts'

const temporaries: string[] = []
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-legacy-alias-'))
  temporaries.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of temporaries.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('reading a default export off a declaration', () => {
  it('sees both spellings', () => {
    expect(declaresDefaultExport('export default class Service {}\n')).toBe(true)
    expect(declaresDefaultExport('declare const x: number\nexport { x as default }\n')).toBe(true)
  })

  it('does not invent one for a function plugin', () => {
    // Mixing the forms makes the Loader discard a function plugin's namespace,
    // so claiming a default the target lacks is the failure to avoid.
    expect(declaresDefaultExport('export declare const apply: () => void\n')).toBe(false)
  })

  it('is not fooled by the word appearing elsewhere', () => {
    expect(declaresDefaultExport('/** The default timeout. */\nexport declare const ms: number\n')).toBe(false)
  })
})

describe('which subpaths a forwarder can stand in for', () => {
  it('takes ordinary entry points', () => {
    expect(forwardable('.')).toBe(true)
    expect(forwardable('./invariant')).toBe(true)
    expect(forwardable('./types')).toBe(true)
  })

  it('skips a wildcard, which would need one file per match', () => {
    expect(forwardable('./src/*')).toBe(false)
  })

  it('skips the manifest, which the forwarder publishes as its own', () => {
    expect(forwardable('./package.json')).toBe(false)
  })

  it('skips the client bundle, which registers itself by a baked-in id', () => {
    // A re-export of a bundle exports its names and never runs the
    // `__ModuleLoader__.load` call the browser is waiting for.
    expect(forwardable('./client')).toBe(false)
  })
})

describe('the files of a forwarder package', () => {
  const files = forwarderFiles('@deepseek-ai/dsh-thing', '@unieai/uad-thing', [
    { subpath: '.', hasDefault: true },
    { subpath: './invariant', hasDefault: false },
    { subpath: './client', hasDefault: false },
    { subpath: './src/*', hasDefault: false },
  ])

  it('re-exports the target from a file per subpath', () => {
    expect(files.get('index.js')).toContain('export * from "@unieai/uad-thing"')
    expect(files.get('invariant.js')).toBe('export * from "@unieai/uad-thing/invariant"\n')
  })

  it('names the default only where the target has one', () => {
    // `export *` never carries a default through.
    expect(files.get('index.js')).toContain('export { default } from "@unieai/uad-thing"')
    expect(files.get('invariant.js')).not.toContain('default')
  })

  it('omits what it cannot forward', () => {
    expect([...files.keys()]).not.toContain('src-*.js')
    expect([...files.keys()]).not.toContain('client.js')
  })

  it('declares the target as its dependency so the target resolves from here', () => {
    const manifest = JSON.parse(files.get('package.json') ?? '{}') as Record<string, unknown>
    expect(manifest['name']).toBe('@deepseek-ai/dsh-thing')
    expect(manifest['dependencies']).toEqual({ '@unieai/uad-thing': '*' })
    expect(manifest['exports']).toMatchObject({ '.': './index.js', './invariant': './invariant.js' })
    expect(manifest['exports']).not.toHaveProperty('./client')
  })

  it('marks itself generated so an installed package is never overwritten', () => {
    const manifest = JSON.parse(files.get('package.json') ?? '{}') as Record<string, unknown>
    expect(manifest[FORWARDER_MARKER]).toBe(true)
  })
})

describe('one package instance under both module-resolution modes', () => {
  /**
   * Build a tree holding the target, a forwarder, and a plain symlink alias.
   * @returns the directory to run the probe in.
   */
  const build = (): string => {
    const dir = scratch()
    const modules = join(dir, 'node_modules')
    const target = join(modules, '@unieai/uad-thing')
    mkdirSync(target, { recursive: true })
    mkdirSync(join(modules, '@deepseek-ai'), { recursive: true })
    writeFileSync(join(target, 'package.json'),
      '{"name":"@unieai/uad-thing","version":"1.0.0","type":"module","main":"index.js"}\n')
    writeFileSync(join(target, 'index.js'), 'export class Marker {}\n')

    const forwarder = join(modules, '@deepseek-ai/dsh-thing')
    mkdirSync(forwarder, { recursive: true })
    for (const [file, contents] of forwarderFiles('@deepseek-ai/dsh-thing', '@unieai/uad-thing',
      [{ subpath: '.', hasDefault: false }])) {
      writeFileSync(join(forwarder, file), contents)
    }
    // The alternative this design rejects, asserted beside it.
    symlinkSync(join('..', '@unieai', 'uad-thing'), join(modules, '@deepseek-ai/dsh-symlinked'))

    writeFileSync(join(dir, 'probe.mjs'), [
      "const target = await import('@unieai/uad-thing')",
      "const forwarded = await import('@deepseek-ai/dsh-thing')",
      "const symlinked = await import('@deepseek-ai/dsh-symlinked')",
      'console.log(JSON.stringify({',
      '  forwarded: forwarded.Marker === target.Marker,',
      '  symlinked: symlinked.Marker === target.Marker,',
      '}))',
    ].join('\n') + '\n')
    return dir
  }

  /**
   * Run the probe under one resolution mode.
   * @param dir - the built tree.
   * @param flags - extra node flags.
   * @returns which aliases reached the same class object.
   */
  const probe = (dir: string, flags: readonly string[]): { forwarded: boolean; symlinked: boolean } =>
    JSON.parse(execFileSync(process.execPath, [...flags, 'probe.mjs'], { cwd: dir, encoding: 'utf8' })) as
      { forwarded: boolean; symlinked: boolean }

  it('holds when Node resolves symlinks, where either alias would do', () => {
    expect(probe(build(), [])).toEqual({ forwarded: true, symlinked: true })
  })

  it('holds under --preserve-symlinks, where only the forwarder does', () => {
    // Electron's Node resolves this way. A symlink alias becomes a second copy
    // of the package: two `Context` classes, and no shared services.
    expect(probe(build(), ['--preserve-symlinks'])).toEqual({ forwarded: true, symlinked: false })
  })
})
