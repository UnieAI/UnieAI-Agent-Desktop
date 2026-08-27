/**
 * The filesystem seam against a real machine.
 *
 * These are the assertions that only a real `sshd` and a real userland can
 * settle: whether the `stat` probe picked the right dialect, whether a
 * filename with a newline in it survives the listing, whether an atomic
 * write keeps the file's mode, and whether a binary file is refused rather
 * than mangled.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`; see
 * `packages/ssh/ssh/tests/live-connection.e2e.ts` for the disposable server.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { FsError } from '@unieai/uad-fs'
import { SshHosts } from '@unieai/uad-ssh'
import { SshFileSystem } from '../src/index.ts'
import { runRemote } from '../src/exec.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

/** A scratch directory on the machine, removed when the suite ends. */
const ROOT = `/tmp/dsh-fs-ssh-${randomUUID()}`

let hosts: SshHosts
let fs: SshFileSystem

/** Run one command on the machine, outside the provider. */
async function remote(line: string): Promise<string> {
  const result = await runRemote(hosts, ALIAS as string, line)
  return Buffer.from(result.stdout).toString('utf8')
}

beforeAll(async () => {
  if (!ready) return
  const ctx = new Context()
  hosts = new SshHosts(ctx, {})
  const original = hosts.argvFor.bind(hosts)
  hosts.argvFor = (alias, line, options) => {
    const argv = original(alias, line, options)
    return [argv[0] as string, '-F', CONFIG as string, ...argv.slice(1)]
  }
  await hosts.ensureControlDir()
  fs = new SshFileSystem(ctx, { machine: ALIAS as string, cwd: ROOT })
  await remote(`mkdir -p '${ROOT}'`)
})

afterAll(async () => {
  if (!ready) return
  await remote(`rm -rf '${ROOT}'`)
})

describe.skipIf(!ready)('files on a real machine', () => {
  it('canonicalizes a path that does not exist yet, which every creation needs', async () => {
    const target = await fs.resolve('new-file.txt')
    expect(target.displayPath).toBe(`${ROOT}/new-file.txt`)
    expect(await fs.stat(target)).toBeUndefined()
  })

  it('follows symlinks the way the machine does', async () => {
    await remote(`cd '${ROOT}' && mkdir -p real && ln -sfn real link`)
    const viaLink = await fs.resolve('link')
    expect(viaLink.displayPath).toBe(`${ROOT}/real`)

    // lstat is path-shaped and must NOT follow: that is its whole purpose.
    const entry = await fs.lstat(`${ROOT}/link`)
    expect(entry?.type).toBe('symlink')
  })

  it('writes, reads back, and reports what changed', async () => {
    const target = await fs.resolve('hello.txt')
    const created = await fs.writeText(target, 'first\n')
    expect(created.operation).toBe('create')
    expect(created.before).toBeNull()
    expect(await fs.readText(target)).toBe('first\n')

    const updated = await fs.writeText(target, 'second\n')
    expect(updated.operation).toBe('update')
    expect(updated.before).toBe('first\n')
    expect(await remote(`cat '${ROOT}/hello.txt'`)).toBe('second\n')
  })

  it('refuses a stale write, and accepts one guarded by the current version', async () => {
    const target = await fs.resolve('guarded.txt')
    await fs.writeText(target, 'one\n')
    const stale = (await fs.stat(target))?.version
    expect(stale).toBeDefined()

    // A change the harness did not make, with a size difference the
    // version derivation can see.
    await remote(`printf 'changed by someone else\\n' > '${ROOT}/guarded.txt'`)
    await expect(fs.writeText(target, 'two\n', { kind: 'replaceIfVersion', version: stale as never }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })

    const fresh = (await fs.stat(target))?.version
    const written = await fs.writeText(target, 'three\n', { kind: 'replaceIfVersion', version: fresh as never })
    expect(written.after).toBe('three\n')
  })

  it('refuses to create over a file that already exists', async () => {
    const target = await fs.resolve('exists.txt')
    await fs.writeText(target, 'here\n')
    await expect(fs.writeText(target, 'again\n', { kind: 'createIfAbsent' }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  })

  it('keeps an existing file\'s permissions, so a script stays executable', async () => {
    await remote(`printf '#!/bin/sh\\necho hi\\n' > '${ROOT}/run.sh' && chmod 755 '${ROOT}/run.sh'`)
    const target = await fs.resolve('run.sh')
    await fs.writeText(target, '#!/bin/sh\necho bye\n')
    expect((await remote(`ls -l '${ROOT}/run.sh' | cut -c1-10`)).trim()).toBe('-rwxr-xr-x')
  })

  it('publishes atomically, leaving no staging file behind', async () => {
    const target = await fs.resolve('atomic.txt')
    await fs.writeText(target, 'content\n')
    expect(await remote(`ls -a '${ROOT}' | grep -c 'dsh-ssh-write' || true`)).toMatch(/^0/)
  })

  it('edits literal text, and refuses an ambiguous one', async () => {
    const target = await fs.resolve('edit.txt')
    await fs.writeText(target, 'alpha\nbeta\nalpha\n')

    await expect(fs.editText(target, { oldString: 'alpha', newString: 'gamma', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_AMBIGUOUS_EDIT' })

    const edited = await fs.editText(target, { oldString: 'alpha', newString: 'gamma', replaceAll: true })
    expect(edited.after).toBe('gamma\nbeta\ngamma\n')
    expect(await remote(`cat '${ROOT}/edit.txt'`)).toBe('gamma\nbeta\ngamma\n')

    await expect(fs.editText(target, { oldString: 'nowhere', newString: 'x', replaceAll: false }))
      .rejects.toMatchObject({ code: 'FS_EDIT_NOT_FOUND' })
  })

  it('lists a directory in one round trip, dotfiles and odd names included', async () => {
    const dir = `${ROOT}/listing`
    // A newline in a filename is legal on every POSIX machine, and is what
    // breaks a line-oriented listing.
    await remote(`mkdir -p '${dir}' && cd '${dir}' && printf x > b.txt && mkdir -p a-dir && printf y > .hidden && touch "$(printf 'odd\\nname')"`)
    const entries = await fs.listDir(await fs.resolve(dir))
    const names = entries.map(entry => entry.name)
    expect(names).toContain('b.txt')
    expect(names).toContain('a-dir')
    expect(names).toContain('.hidden')
    expect(names).toContain('odd\nname')
    expect(entries.find(entry => entry.name === 'a-dir')?.type).toBe('directory')
    expect(entries.find(entry => entry.name === 'b.txt')?.size).toBe(1)
    // Stable order, whatever the machine's locale collation is.
    expect([...names].sort()).toEqual(names)
  })

  it('streams a large file, splitting multi-byte characters across chunks', async () => {
    const target = await fs.resolve('big.txt')
    // 200k of a 3-byte character: chunk boundaries will land mid-character.
    const line = '螢幕擷取螢幕擷取螢幕擷取螢幕擷取\n'
    await fs.writeText(target, line.repeat(8000))
    let text = ''
    for await (const chunk of await fs.streamText(target)) text += chunk
    expect(text).toBe(line.repeat(8000))
  })

  it('refuses a binary file rather than returning mangled text', async () => {
    await remote(`printf 'ok\\000binary' > '${ROOT}/binary.bin'`)
    const target = await fs.resolve('binary.bin')
    await expect(fs.readText(target)).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
    // The raw bytes are still available, because only text has that rule.
    expect(await fs.readBytes(target, undefined, 1024)).toHaveLength(9)
  })

  it('refuses a read past the caller\'s ceiling instead of buffering it first', async () => {
    const target = await fs.resolve('big.txt')
    await expect(fs.readBytes(target, undefined, 1024)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
  })

  it('reports a missing file as missing, not as an empty one', async () => {
    const target = await fs.resolve('absent.txt')
    await expect(fs.readText(target)).rejects.toBeInstanceOf(FsError)
    expect(await fs.stat(target)).toBeUndefined()
  })

  it('answers containment without anyone parsing a target key', async () => {
    const parent = await fs.resolve(ROOT)
    const child = await fs.resolve(`${ROOT}/listing/b.txt`)
    const sibling = await fs.resolve('/tmp')
    expect(fs.contains(parent, child)).toBe(true)
    expect(fs.contains(parent, parent)).toBe(true)
    expect(fs.contains(child, parent)).toBe(false)
    expect(fs.contains(parent, sibling)).toBe(false)
  })

  it('gives a process path and a file URL in the remote\'s namespace', async () => {
    const target = await fs.resolve('hello.txt')
    expect(fs.processPath(target)).toBe(`${ROOT}/hello.txt`)
    expect(fs.fileUrl(target)).toBe(`file://${ROOT}/hello.txt`)
  })
})
