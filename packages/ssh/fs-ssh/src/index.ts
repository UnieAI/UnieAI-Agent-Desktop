/**
 * The filesystem seam, placed on a machine reached over SSH.
 *
 * Mounted beside [`subprocess-ssh`](../../subprocess-ssh/README.md) and
 * pointing at the same machine, it completes the execution world the
 * [portable execution-world
 * decision](../../../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md)
 * defines: the file tools, the editor, search and the language servers all
 * see the remote machine's files, and none of them knows why.
 *
 * Everything crosses as shell commands over the shared connection. There is
 * no agent on the machine to ask, which is the point — an `sshd` is enough —
 * and the cost is that each operation must be expressible in POSIX shell and
 * must survive both userland dialects (`shell.ts` owns that).
 *
 * @module @unieai/uad-fs-ssh
 */

import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { FileSystem, FsError, FsTargetKey, FsVersion } from '@unieai/uad-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from '@unieai/uad-fs'
import type { SshHosts } from '@unieai/uad-ssh'
import {
  atomicWriteCommand,
  canonicalizeCommand,
  listCommand,
  makeDirectoryCommand,
  readCommand,
  statCommand,
  STAT_DIALECT_PROBE,
} from './shell.ts'
import type { StatDialect } from './shell.ts'
import { runRemote, RemoteTooLarge, streamRemote } from './exec.ts'

export * from './shell.ts'
export { runRemote, RemoteTooLarge, streamRemote } from './exec.ts'
export type { RemoteOptions, RemoteResult } from './exec.ts'

/** How much of a file is inspected for the NUL that marks it binary. */
const BINARY_SAMPLE_BYTES = 8192

/** Configuration for the remote filesystem provider. */
export interface Config {
  /** Alias of the machine whose files this provider serves. */
  machine: string
  /** Directory relative paths resolve against, on that machine. */
  cwd: string
}

/** Schema for the remote filesystem provider. */
export const Config: z<Config> = z.object({
  machine: z.string().required(),
  cwd: z.string().required(),
})

/**
 * Decode file bytes as text, refusing what the seam calls not-text.
 * @param bytes - the file's raw content.
 * @param displayPath - path named in the error.
 * @returns the decoded content.
 */
function decodeText(bytes: Uint8Array, displayPath: string): string {
  if (bytes.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
    throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
  }
}

/** Whether the sampled text is predominantly CRLF. */
function detectsCrlf(value: string): boolean {
  const sample = value.slice(0, 4096)
  const crlf = sample.split('\r\n').length - 1
  const lf = sample.split('\n').length - 1 - crlf
  return crlf > lf
}

/** LF-normalized storage text, the basis every diff is computed on. */
function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n')
}

/** Restore the line endings the file had before it was read. */
function restoreLineEndings(value: string, crlf: boolean): string {
  return crlf ? normalizeLineEndings(value).replaceAll('\n', '\r\n') : value
}

/** One `type size mtime` record as the remote printed it. */
interface RemoteStat {
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
  mtime: string
}

/**
 * Parse one metadata line.
 * @param text - the remote command's stdout.
 * @returns the record, or undefined when the line is not one.
 */
function parseStat(text: string): RemoteStat | undefined {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 3) return undefined
  const [type, size, mtime] = parts as [string, string, string]
  if (type !== 'file' && type !== 'directory' && type !== 'symlink' && type !== 'other') return undefined
  return { type, size: Number.parseInt(size, 10), mtime }
}

/**
 * The remote filesystem.
 *
 * One instance serves one machine; a second machine is a second mount, and
 * targets never cross between them because every target key carries the
 * alias it came from.
 */
export class SshFileSystem extends FileSystem {
  /** The machine book supplies connection arguments. */
  static inject = ['ssh']

  /** Config schema, reachable from a composition that constructs directly. */
  static Config: z<Config> = Config

  /** Which `stat` this machine speaks; probed once, then remembered. */
  private dialect: Promise<StatDialect> | undefined

  constructor(ctx: Context, public fsConfig: Config) {
    super(ctx)
  }

  /**
   * Ask the machine which `stat` it speaks, once.
   *
   * Probed rather than inferred from `uname`: a Linux host can carry BSD
   * tools and a Mac can carry GNU ones, and the answer must describe the
   * `stat` that will actually run.
   * @returns the dialect.
   */
  private statDialect(): Promise<StatDialect> {
    this.dialect ??= (async () => {
      const result = await runRemote(this.hosts, this.fsConfig.machine, STAT_DIALECT_PROBE)
      const answer = Buffer.from(result.stdout).toString('utf8').trim()
      if (answer === 'gnu' || answer === 'bsd') return answer
      throw new FsError(
        `${this.fsConfig.machine} has no usable stat(1): the filesystem seam needs one of GNU or BSD`,
        'FS_IO_ERROR',
      )
    })()
    return this.dialect
  }

  /** The machine book, read through the declared injection. */
  private get hosts(): SshHosts {
    return this.ctx.ssh
  }

  /**
   * Run one filesystem command on the machine.
   * @param line - the remote command line.
   * @param options - stdin, cancellation, and the stdout ceiling.
   * @returns the command's result.
   */
  private run(line: string, options: Parameters<typeof runRemote>[3] = {}) {
    return runRemote(this.hosts, this.fsConfig.machine, line, options)
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    const cwd = opts?.cwd ?? this.fsConfig.cwd
    const result = await this.run(canonicalizeCommand(path, cwd), { signal: opts?.signal, maxBytes: 65536 })
    const canonical = Buffer.from(result.stdout).toString('utf8').trim()
    if (result.code !== 0 || canonical === '') {
      // The remote's own words. Without them this reads as "the path is not
      // there" for every cause there is: a refused connection, a missing
      // key, a starting directory that exists here and not there. The exit
      // codes are the command's own — 3 could not enter the starting
      // directory, 4 could not enter the path.
      const reason = result.stderr.trim().split('\n').slice(-2).join(' ')
      const cause = result.code === 3
        ? `cannot enter the starting directory ${JSON.stringify(cwd)}`
        : result.code === 4 ? 'no such directory' : `exit ${String(result.code)}`
      throw new FsError(
        `cannot resolve ${JSON.stringify(path)} on ${this.fsConfig.machine}: ${cause}${reason === '' ? '' : ` — ${reason}`}`,
        'FS_NOT_FOUND',
      )
    }
    return this.targetFor(canonical)
  }

  /**
   * Build a target from a canonical remote path.
   *
   * The key carries the machine, so a target from one machine can never be
   * mistaken for a same-named path on another.
   * @param canonical - the canonical absolute remote path.
   * @returns the target.
   */
  private targetFor(canonical: string): FsTarget {
    return {
      targetKey: FsTargetKey(`ssh:${this.fsConfig.machine}:${canonical}`),
      displayPath: canonical,
    }
  }

  /**
   * The canonical path inside one of this provider's targets.
   * @param target - a target this provider resolved.
   * @returns the remote path.
   */
  private pathOf(target: FsTarget): string {
    const prefix = `ssh:${this.fsConfig.machine}:`
    const key = String(target.targetKey)
    if (!key.startsWith(prefix)) {
      throw new FsError(`target "${target.displayPath}" belongs to another execution world`, 'FS_IO_ERROR')
    }
    return key.slice(prefix.length)
  }

  override processPath(target: FsTarget): string {
    return this.pathOf(target)
  }

  override fileUrl(target: FsTarget): string {
    // The remote is POSIX (its shell must be), so the path needs no drive or
    // separator translation — only percent-encoding of each segment.
    const encoded = this.pathOf(target).split('/').map(encodeURIComponent).join('/')
    return `file://${encoded}`
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    const parentPath = this.pathOf(parent)
    const childPath = this.pathOf(child)
    if (childPath === parentPath) return true
    const base = parentPath.endsWith('/') ? parentPath : `${parentPath}/`
    return childPath.startsWith(base)
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    const record = await this.statOf(this.pathOf(target), true, signal)
    if (record === undefined) return undefined
    const type = record.type === 'symlink' ? 'other' : record.type
    return {
      version: this.versionOf(this.pathOf(target), record),
      type,
      ...(type === 'file' ? { size: record.size } : {}),
    }
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    const cwd = opts?.cwd ?? this.fsConfig.cwd
    const absolute = path.startsWith('/') ? path : posix.join(cwd, path)
    const record = await this.statOf(absolute, false, signal)
    if (record === undefined) return undefined
    return {
      version: this.versionOf(absolute, record),
      type: record.type,
      ...(record.type === 'file' ? { size: record.size } : {}),
    }
  }

  /**
   * Read one path's metadata.
   * @param path - absolute remote path.
   * @param follow - resolve a final symlink first.
   * @param signal - aborts the round trip.
   * @returns the record, or undefined when the path is absent.
   */
  private async statOf(path: string, follow: boolean, signal?: AbortSignal): Promise<RemoteStat | undefined> {
    const dialect = await this.statDialect()
    const result = await this.run(statCommand(path, dialect, follow), { signal, maxBytes: 4096 })
    if (result.code !== 0) return undefined
    return parseStat(Buffer.from(result.stdout).toString('utf8'))
  }

  /**
   * The freshness token for one path.
   *
   * Derived from size and modification time, which is what a remote can
   * report cheaply. Two writes within the same second that keep the byte
   * count identical are therefore indistinguishable — the same limit every
   * mtime-based guard has, and the reason a write's own outcome carries the
   * version rather than a re-read.
   * @param path - absolute remote path.
   * @param record - its metadata.
   * @returns the opaque version.
   */
  private versionOf(path: string, record: RemoteStat): ReturnType<typeof FsVersion> {
    const facts = JSON.stringify([this.fsConfig.machine, path, record.type, record.size, record.mtime])
    return FsVersion(`ssh:${createHash('sha256').update(facts).digest('hex')}`)
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    const path = this.pathOf(target)
    const result = await this.run(readCommand(path), { signal })
    if (result.code !== 0) throw this.readFailure(target, result.code, result.stderr)
    return decodeText(result.stdout, target.displayPath)
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    const path = this.pathOf(target)
    // Existence and regularity are settled before streaming starts, so a
    // consumer learns that a directory is not readable from the error rather
    // than from an empty stream.
    const record = await this.statOf(path, true, signal)
    if (record === undefined) throw new FsError(`"${target.displayPath}" does not exist`, 'FS_NOT_FOUND')
    if (record.type !== 'file') {
      throw new FsError(`"${target.displayPath}" is not a regular file`, 'FS_NOT_REGULAR_FILE')
    }
    const hosts = this.hosts
    const machine = this.fsConfig.machine
    const displayPath = target.displayPath
    return (async function* decoded() {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      let inspected = 0
      for await (const chunk of streamRemote(hosts, machine, readCommand(path), signal)) {
        if (inspected < BINARY_SAMPLE_BYTES) {
          if (chunk.subarray(0, BINARY_SAMPLE_BYTES - inspected).includes(0)) {
            throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT')
          }
          inspected += chunk.byteLength
        }
        try {
          // Streaming decode: a multi-byte character split across two chunks
          // is held until its continuation arrives.
          yield decoder.decode(chunk, { stream: true })
        } catch (error: unknown) {
          throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
        }
      }
      const tail = decoder.decode()
      if (tail !== '') yield tail
    })()
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    const path = this.pathOf(target)
    try {
      const result = await this.run(readCommand(path), { signal, maxBytes })
      if (result.code !== 0) throw this.readFailure(target, result.code, result.stderr)
      return result.stdout
    } catch (error: unknown) {
      if (error instanceof RemoteTooLarge) {
        throw new FsError(`"${target.displayPath}" exceeds ${String(maxBytes)} bytes`, 'FS_TOO_LARGE', { cause: error })
      }
      throw error
    }
  }

  /**
   * Classify a failed read.
   * @param target - the target that was read.
   * @param code - the remote exit status.
   * @param stderr - what the remote wrote to standard error.
   * @returns the error to raise.
   */
  private readFailure(target: FsTarget, code: number, stderr: string): FsError {
    if (code === 1) {
      return new FsError(`"${target.displayPath}" is not a readable regular file`, 'FS_NOT_FOUND')
    }
    if (/permission denied/i.test(stderr)) {
      return new FsError(`cannot read "${target.displayPath}": permission denied`, 'FS_PERMISSION_DENIED')
    }
    return new FsError(`cannot read "${target.displayPath}": ${stderr.trim()}`, 'FS_IO_ERROR')
  }

  override async createDirectory(parent: FsTarget, name: string, signal?: AbortSignal): Promise<FsTarget> {
    if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/u.test(name)) {
      throw new FsError(`cannot create "${name}": not one path segment`, 'FS_NOT_DIRECTORY')
    }
    const path = this.pathOf(parent)
    const result = await this.run(makeDirectoryCommand(path, name), { signal })
    const target = posix.join(path, name)
    if (result.code === 3) throw new FsError(`cannot create "${target}": already exists`, 'FS_ALREADY_EXISTS')
    if (result.code === 4) throw new FsError(`cannot create "${target}": the parent does not exist`, 'FS_NOT_FOUND')
    if (result.code !== 0) throw new FsError(`cannot create "${target}" on the machine`, 'FS_IO_ERROR')
    return await this.resolve(target, signal === undefined ? {} : { signal })
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const path = this.pathOf(target)
    const dialect = await this.statDialect()
    const result = await this.run(listCommand(path, dialect), { signal })
    if (result.code !== 0) {
      throw new FsError(`"${target.displayPath}" is not a listable directory`, 'FS_NOT_DIRECTORY')
    }
    const entries: FsDirEntry[] = []
    for (const record of Buffer.from(result.stdout).toString('utf8').split('\0')) {
      if (record === '') continue
      const match = /^(\S+) (\d+) (\S+) ([\s\S]*)$/.exec(record)
      if (match === null) continue
      const [, type, size, mtime, name] = match as unknown as [string, RemoteStat['type'], string, string, string]
      const childPath = posix.join(path, name)
      const childType = type === 'directory' ? 'directory' : type === 'file' ? 'file' : 'other'
      entries.push({
        name,
        type: childType,
        target: this.targetFor(childPath),
        version: this.versionOf(childPath, { type, size: Number.parseInt(size, 10), mtime }),
        ...(childType === 'file' ? { size: Number.parseInt(size, 10) } : {}),
      })
    }
    // The remote's glob order is the shell's collation, which varies with the
    // machine's locale; the seam promises a stable order to its consumers.
    return entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  }

  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
  ): Promise<FsWriteOutcome> {
    const path = this.pathOf(target)
    const existing = await this.statOf(path, true, signal)

    if (expected?.kind === 'createIfAbsent' && existing !== undefined) {
      throw new FsError(`"${target.displayPath}" already exists`, 'FS_STALE_VERSION')
    }
    if (expected?.kind === 'replaceIfVersion') {
      if (existing === undefined) throw new FsError(`"${target.displayPath}" no longer exists`, 'FS_STALE_VERSION')
      if (this.versionOf(path, existing) !== expected.version) {
        throw new FsError(`"${target.displayPath}" changed since it was read`, 'FS_STALE_VERSION')
      }
    }

    const before = existing === undefined ? null : await this.textBefore(target, signal)
    const crlf = before !== null && detectsCrlf(before)
    const stored = normalizeLineEndings(content)
    await this.publish(path, restoreLineEndings(stored, crlf), target, signal)

    return {
      operation: existing === undefined ? 'create' : 'update',
      version: await this.versionAfter(path, target, signal),
      before: before === null ? null : normalizeLineEndings(before),
      after: stored,
    }
  }

  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: ReturnType<typeof FsVersion> },
    signal?: AbortSignal,
  ): Promise<FsEditOutcome> {
    const path = this.pathOf(target)
    const existing = await this.statOf(path, true, signal)
    if (existing === undefined) throw new FsError(`"${target.displayPath}" does not exist`, 'FS_NOT_FOUND')
    if (expected !== undefined && this.versionOf(path, existing) !== expected.version) {
      throw new FsError(`"${target.displayPath}" changed since it was read`, 'FS_STALE_VERSION')
    }

    const raw = await this.readText(target, signal)
    const crlf = detectsCrlf(raw)
    const before = normalizeLineEndings(raw)
    const search = normalizeLineEndings(edit.oldString)
    if (search === '') throw new FsError('an edit needs text to replace', 'FS_EDIT_NOT_FOUND')

    const occurrences = before.split(search).length - 1
    if (occurrences === 0) throw new FsError(`"${edit.oldString}" is not in "${target.displayPath}"`, 'FS_EDIT_NOT_FOUND')
    if (occurrences > 1 && !edit.replaceAll) {
      throw new FsError(
        `"${edit.oldString}" appears ${String(occurrences)} times in "${target.displayPath}"`,
        'FS_AMBIGUOUS_EDIT',
      )
    }

    const replacement = normalizeLineEndings(edit.newString)
    const after = edit.replaceAll ? before.split(search).join(replacement) : before.replace(search, replacement)
    await this.publish(path, restoreLineEndings(after, crlf), target, signal)
    return { version: await this.versionAfter(path, target, signal), before, after }
  }

  /**
   * The prior content a write reports as its diff basis.
   *
   * A file that cannot be read as text has no basis to offer, and the seam
   * says so with `null` rather than failing the write: replacing a binary
   * file is legitimate, and only the contextual diff is lost.
   * @param target - the file about to be written.
   * @param signal - aborts the read.
   * @returns the prior text, or null when there is none to give.
   */
  private async textBefore(target: FsTarget, signal?: AbortSignal): Promise<string | null> {
    try {
      return await this.readText(target, signal)
    } catch (error: unknown) {
      if (error instanceof FsError && error.code === 'FS_NOT_TEXT') return null
      throw error
    }
  }

  /**
   * Publish new content atomically.
   * @param path - absolute remote path.
   * @param content - the exact bytes to publish, line endings already restored.
   * @param target - the target, named in a failure.
   * @param signal - aborts before publication.
   */
  private async publish(path: string, content: string, target: FsTarget, signal?: AbortSignal): Promise<void> {
    const dialect = await this.statDialect()
    const result = await this.run(atomicWriteCommand(path, dialect), {
      stdin: Buffer.from(content, 'utf8'),
      signal,
    })
    if (result.code === 0) return
    if (/permission denied/i.test(result.stderr)) {
      throw new FsError(`cannot write "${target.displayPath}": permission denied`, 'FS_PERMISSION_DENIED')
    }
    throw new FsError(`cannot write "${target.displayPath}": ${result.stderr.trim()}`, 'FS_IO_ERROR')
  }

  /**
   * The version a write produced.
   * @param path - absolute remote path.
   * @param target - the target, named in a failure.
   * @param signal - aborts the round trip.
   * @returns the new version.
   */
  private async versionAfter(path: string, target: FsTarget, signal?: AbortSignal): Promise<ReturnType<typeof FsVersion>> {
    const written = await this.statOf(path, true, signal)
    if (written === undefined) {
      throw new FsError(`"${target.displayPath}" disappeared immediately after being written`, 'FS_IO_ERROR')
    }
    return this.versionOf(path, written)
  }
}

export default SshFileSystem
