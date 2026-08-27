/**
 * Editing someone else's file.
 *
 * The configuration belongs to the person: their comments, their order,
 * their includes, their options. These tests are mostly about what survives
 * an edit, not about what the edit writes.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addHost, blockSpan, hostBlock, removeHost } from '../src/edit.ts'
import { readHostEntries } from '../src/config-file.ts'

/** A configuration with the things a real one has. */
const EXISTING = `# my machines, ordered by how often I use them
Host build
  HostName 10.0.0.2
  User dev

# the GPU box — do not add ForwardAgent here, see the incident notes
Host gpu
  HostName gpu.internal
  Port 2222

Include work/*.conf

Host *
  ServerAliveInterval 30
`

async function configFile(text = EXISTING): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'dsh-ssh-edit-')), 'config')
  await writeFile(path, text)
  return path
}

describe('writing a new machine down', () => {
  it('writes only the fields a person filled in', () => {
    // An option written with its default looks like a decision, and the next
    // reader cannot tell it from one.
    expect(hostBlock({ alias: 'plain' })).toBe('\nHost plain\n')
    expect(hostBlock({ alias: 'box', hostName: '10.0.0.5', port: 22 })).toBe('\nHost box\n  HostName 10.0.0.5\n')
  })

  it('spells every field the way ssh_config does', () => {
    expect(hostBlock({ alias: 'b', hostName: 'h', user: 'u', port: 2222, identityFile: '~/.ssh/k', proxyJump: 'bastion' }))
      .toBe('\nHost b\n  HostName h\n  User u\n  Port 2222\n  IdentityFile ~/.ssh/k\n  ProxyJump bastion\n')
  })
})

describe('adding', () => {
  it('appends, leaving every byte that was there alone', async () => {
    const path = await configFile()
    expect(await addHost(path, { alias: 'new-box', hostName: '10.0.0.9' })).toBeUndefined()
    const after = await readFile(path, 'utf8')
    expect(after.startsWith(EXISTING.trimEnd())).toBe(true)
    expect(after).toContain('# the GPU box — do not add ForwardAgent here, see the incident notes')
    expect(after.trimEnd().endsWith('Host new-box\n  HostName 10.0.0.9')).toBe(true)
  })

  it('makes the machine selectable, read back through the ordinary list', async () => {
    const path = await configFile()
    await addHost(path, { alias: 'new-box' })
    expect((await readHostEntries(path)).map(entry => entry.alias)).toEqual(['build', 'gpu', 'new-box'])
  })

  it('starts a file for a person who has none', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'dsh-ssh-edit-')), 'config')
    expect(await addHost(path, { alias: 'first' })).toBeUndefined()
    expect((await readFile(path, 'utf8')).trim()).toBe('Host first')
  })

  it('refuses a name that is a pattern rather than a machine', async () => {
    // `Host *` configures every connection; writing one from a form that
    // says "add a machine" would change how every other machine is reached.
    const path = await configFile()
    expect(await addHost(path, { alias: '*' })).toMatchObject({ kind: 'invalid-alias' })
    expect(await addHost(path, { alias: '*.internal' })).toMatchObject({ kind: 'invalid-alias' })
    expect(await readFile(path, 'utf8')).toBe(EXISTING)
  })

  it('refuses a machine that is already written down', async () => {
    const path = await configFile()
    expect(await addHost(path, { alias: 'gpu' })).toMatchObject({ kind: 'duplicate', alias: 'gpu' })
    expect(await readFile(path, 'utf8')).toBe(EXISTING)
  })
})

describe('finding a block', () => {
  it('runs from the Host line to the next one, so its options travel with it', () => {
    // Not as far as the next Host line: the blank and the comment before it
    // belong to the machine that follows.
    expect(blockSpan(EXISTING, 'build')).toEqual({ start: 1, end: 4 })
  })

  it('stops at a Match, whose meaning depends on where it sits', () => {
    const text = 'Host a\n  User x\nMatch host b\n  User y\n'
    expect(blockSpan(text, 'a')).toEqual({ start: 0, end: 2 })
  })

  it('takes the blank line above, so removing does not leave a growing gap', () => {
    // `gpu` is preceded by a blank line and a comment; the blank goes.
    expect(blockSpan(EXISTING, 'gpu')).toMatchObject({ start: 6 })
  })

  it('says when a machine is not there', () => {
    expect(blockSpan(EXISTING, 'absent')).toMatchObject({ kind: 'not-found' })
  })
})

describe('removing', () => {
  it('takes the block and nothing else', async () => {
    const path = await configFile()
    expect(await removeHost(path, 'build')).toBeUndefined()
    const after = await readFile(path, 'utf8')
    expect(after).not.toContain('Host build')
    expect(after).toContain('# my machines, ordered by how often I use them')
    expect(after).toContain('Host gpu')
    expect(after).toContain('Include work/*.conf')
    expect(after).toContain('Host *\n  ServerAliveInterval 30')
  })

  it('keeps the comment that belongs to the block below it', async () => {
    const path = await configFile()
    await removeHost(path, 'build')
    expect(await readFile(path, 'utf8')).toContain('# the GPU box')
  })

  it('refuses an alias that shares its line with other machines', async () => {
    // Deleting the line would take the others; rewriting it would be the
    // in-place edit this module does not do.
    const path = await configFile('Host red blue\n  User dev\n')
    expect(await removeHost(path, 'red')).toMatchObject({ kind: 'shared-line', alias: 'red' })
    expect(await readFile(path, 'utf8')).toBe('Host red blue\n  User dev\n')
  })

  it('refuses a machine that came from an included file, naming where it lives', async () => {
    const path = await configFile()
    expect(await removeHost(path, 'office', '/home/dev/.ssh/work/office.conf'))
      .toMatchObject({ kind: 'declared-elsewhere', source: '/home/dev/.ssh/work/office.conf' })
    expect(await readFile(path, 'utf8')).toBe(EXISTING)
  })

  it('says when there is nothing to remove', async () => {
    const path = await configFile()
    expect(await removeHost(path, 'absent')).toMatchObject({ kind: 'not-found' })
  })
})
