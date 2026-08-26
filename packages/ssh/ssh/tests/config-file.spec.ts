/**
 * Which machines a person can pick, read from their own OpenSSH file.
 *
 * The enumeration is deliberately shallow — it answers "what could I pick",
 * not "what does this mean" — so these tests pin what belongs in a list and
 * what does not.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { includePaths, readHostEntries, splitDirective } from '../src/config-file.ts'

async function configDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-ssh-config-'))
}

describe('reading a directive', () => {
  it('accepts every separator OpenSSH accepts', () => {
    expect(splitDirective('Host build')).toEqual({ keyword: 'host', argument: 'build' })
    expect(splitDirective('  HostName=example.org  ')).toEqual({ keyword: 'hostname', argument: 'example.org' })
    expect(splitDirective('Port  =  2222')).toEqual({ keyword: 'port', argument: '2222' })
  })

  it('ignores blank lines and comments', () => {
    expect(splitDirective('')).toBeUndefined()
    expect(splitDirective('   ')).toBeUndefined()
    expect(splitDirective('# Host commented')).toBeUndefined()
  })
})

describe('listing machines', () => {
  it('offers the aliases and keeps their file', async () => {
    const dir = await configDir()
    const path = join(dir, 'config')
    await writeFile(path, 'Host build\n  HostName 10.0.0.2\n\nHost gpu-box\n  User dev\n')
    const entries = await readHostEntries(path)
    expect(entries.map(entry => entry.alias)).toEqual(['build', 'gpu-box'])
    expect(entries[0]?.source).toBe(path)
  })

  it('takes every alias on one Host line, because they are separate destinations', async () => {
    const dir = await configDir()
    const path = join(dir, 'config')
    await writeFile(path, 'Host red blue\n  User dev\n')
    expect((await readHostEntries(path)).map(entry => entry.alias)).toEqual(['red', 'blue'])
  })

  it('leaves out patterns, which configure connections rather than name one', async () => {
    const dir = await configDir()
    const path = join(dir, 'config')
    await writeFile(path, 'Host *\n  ServerAliveInterval 30\n\nHost *.internal\n  User dev\n\nHost !prod\n  User dev\n\nHost real\n')
    expect((await readHostEntries(path)).map(entry => entry.alias)).toEqual(['real'])
  })

  it('follows Include, which is how a person splits a long configuration', async () => {
    const dir = await configDir()
    const path = join(dir, 'config')
    await writeFile(join(dir, 'work'), 'Host office\n')
    await writeFile(path, 'Include work\nHost home\n')
    expect((await readHostEntries(path)).map(entry => entry.alias)).toEqual(['office', 'home'])
  })

  it('survives an include cycle instead of recursing forever', async () => {
    const dir = await configDir()
    const path = join(dir, 'config')
    await writeFile(join(dir, 'other'), 'Include config\nHost other\n')
    await writeFile(path, 'Include other\nHost first\n')
    expect((await readHostEntries(path)).map(entry => entry.alias)).toEqual(['other', 'first'])
  })

  it('reports no machines when the file does not exist', async () => {
    // A person who has never written an ssh config has no machines yet;
    // that is a state to show, not an error to raise.
    expect(await readHostEntries(join(await configDir(), 'absent'))).toEqual([])
  })
})

describe('include paths', () => {
  it('resolves a relative include against the including file', () => {
    expect(includePaths('work', '/home/dev/.ssh')).toEqual(['/home/dev/.ssh/work'])
  })

  it('keeps an absolute include as written', () => {
    expect(includePaths('/etc/ssh/extra', '/home/dev/.ssh')).toEqual(['/etc/ssh/extra'])
  })

  it('takes several patterns from one directive', () => {
    expect(includePaths('a b', '/base')).toEqual(['/base/a', '/base/b'])
  })
})
