/**
 * Browse backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `browse` capability — one-level directory listing and child-directory
 * creation. Nothing renders on the host display, so this backend serves remote
 * clients the dialog backend cannot. Policy decisions (hidden entries flagged
 * but returned, symlinks followed, whole-filesystem scope) are recorded in the
 * directory-picker seam Agent Note.
 *
 * IT FOLLOWS THE MACHINE. When the work is happening on another machine, the
 * folders someone picks from must be that machine's: a person who selected a
 * build box and was shown their laptop's directories would choose a path that
 * does not exist where the work runs. So a non-local machine is listed through
 * `ctx.fs`, which the execution router already aims at whichever machine is
 * current, and this computer keeps the streaming `node:fs` path below.
 *
 * The two paths are not a fallback pair; they are two different questions.
 * Locally the level is streamed one dirent at a time into a bounded window, so
 * a directory with a million children costs a fixed amount of memory. Across a
 * connection that shape is unavailable and undesirable — the seam answers a
 * whole level in one round trip, which is the same trade `fs-ssh` documents,
 * because a per-child probe on a 30 ms link is six seconds to open a folder.
 * @module @unieai/uad-host-directory-picker-browse
 */

import { mkdir, opendir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, posix, resolve, win32 } from 'node:path'
import type { Context } from '@unieai/cordis'
// Empty type imports carry the `fs` and `machines` Context merges for the
// optional reads below; neither service is injected, because a deployment that
// composes neither still browses this computer exactly as it always did.
import type {} from '@unieai/uad-fs'
import type {} from '@unieai/uad-machines'
import { FsError } from '@unieai/uad-fs'
import type { FsTarget } from '@unieai/uad-fs'
import { LOCAL_MACHINE } from '@unieai/uad-machines'
import z from '@unieai/schemastery'
import {
  DirectoryPicker, DirectoryPickerError,
} from '@unieai/uad-host-directory-picker'
import type {
  DirectoryEntry, DirectoryListing, DirectoryPickerCapability,
} from '@unieai/uad-host-directory-picker'

/**
 * Ancestor chain from the filesystem root to `target` inclusive — the
 * breadcrumb rows of a listing, every one a jump target.
 */
function ancestryCrumbs(target: string): DirectoryEntry[] {
  const crumbs: DirectoryEntry[] = []
  let current = target
  for (;;) {
    const parent = dirname(current)
    // basename of a root is '' — label the root crumb by its full path ('/', 'C:\').
    crumbs.unshift({ name: parent === current ? current : basename(current), path: current, hidden: false })
    if (parent === current) return crumbs
    current = parent
  }
}

/**
 * True when the path names one fixed filesystem location regardless of
 * process state: POSIX-absolute on POSIX; on Windows only drive-qualified
 * (`C:\…`) or complete UNC (`\\server\share…`) forms. Rooted drive-less
 * forms (`\foo`, `/foo`) and incomplete UNC prefixes (`\\`, `\\server`)
 * pass `isAbsolute` yet still resolve against the process's current drive.
 * @param path - candidate path.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns whether the path is fully qualified on the platform.
 */
export function fullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
    : posix.isAbsolute(path)
}

/** One streamed listing candidate: the dirent facts a row needs, nothing else retained. */
export interface ListingCandidate {
  /** Base name within the streamed level. */
  name: string
  /** Dirent says directory (no probe needed). */
  isDirectory: boolean
  /** Dirent says symlink (enterability needs a stat probe). */
  isSymbolicLink: boolean
}

/**
 * Insert a streamed candidate into the name-sorted bounded window, evicting
 * the name-largest candidate when the window exceeds `keep`. Memory over an
 * arbitrarily large level therefore stays O(keep) regardless of how many
 * children the directory holds.
 * @param window - the name-ascending window, mutated in place.
 * @param candidate - the streamed candidate to place.
 * @param keep - the window bound.
 * @returns true when an eviction happened (the level has candidates beyond the window).
 */
export function boundedInsert(window: ListingCandidate[], candidate: ListingCandidate, keep: number): boolean {
  // Full window, name at or beyond the tail: one comparison rejects, so an
  // oversized level costs O(1) per candidate past the head instead of a
  // window scan (100k children against a 1,001 window must not approach
  // 10^8 comparisons).
  // oxlint-disable-next-line typescript/no-non-null-assertion -- a full window (length === keep >= 1) has a tail
  if (window.length === keep && candidate.name.localeCompare(window[window.length - 1]!.name) >= 0) return true
  // Binary insertion keeps a retained candidate at O(log keep) comparisons.
  let lo = 0
  let hi = window.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
    if (candidate.name.localeCompare(window[mid]!.name) < 0) hi = mid
    else lo = mid + 1
  }
  window.splice(lo, 0, candidate)
  if (window.length <= keep) return false
  window.pop()
  return true
}

/**
 * Await `operation`, but reject with the signal's reason the moment it
 * aborts. Node's filesystem reads are not retractable, so the operation
 * itself keeps running against a handle the caller then closes — its late
 * settlement is swallowed here so an abandoned read cannot surface as an
 * unhandled rejection.
 * @param operation - the in-flight filesystem step.
 * @param signal - caller lifetime; absent means plain awaiting.
 * @returns the operation's value.
 */
export function raceAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      operation.catch(() => {
        // Abandoned read: its handle is being closed by the aborting caller,
        // and the abort reason already carried the outcome.
      })
      reject(asError(signal.reason))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (reason: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(asError(reason))
      },
    )
  })
}

/** The thrown value as an Error (wire/abort reasons may be anything). */
function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/* v8 ignore start -- a close failure of an abandoned handle has no consumer, and forcing one needs a filesystem torn down mid-request. */
/** Swallow the close failure of a handle its caller already departed. */
function swallowCloseFailure(): void {}
/* v8 ignore stop */

/** Message text of an unknown thrown value. */
function messageOf(error: unknown): string {
  /* v8 ignore next -- node:fs rejects with Error instances; the String arm only satisfies the unknown narrowing. */
  return error instanceof Error ? error.message : String(error)
}

/**
 * One listing row for a dirent, following symlinks to directories; null for
 * non-directories and broken/cyclic links (skipped silently — the browser
 * shows what can be entered, and a broken link cannot).
 */
async function directoryRow(
  parent: string, name: string, isDirectory: boolean, isSymbolicLink: boolean, signal: AbortSignal | undefined,
): Promise<DirectoryEntry | null> {
  const path = join(parent, name)
  let enterable = isDirectory
  if (!enterable && isSymbolicLink) {
    try {
      // The probe races the caller too: a symlink target on a stalled
      // network filesystem must not keep a departed caller's request alive.
      enterable = (await raceAbort(stat(path), signal)).isDirectory()
    } catch {
      /* v8 ignore next 2 -- an abort landing mid-probe needs a stalled stat; the per-candidate check in list covers the settled path. */
      if (signal?.aborted) throw asError(signal.reason)
      // Broken or cyclic symlink: stat is the probe, failure means "not enterable".
      return null
    }
  }
  if (!enterable) return null
  // POSIX hidden convention; Windows' hidden attribute is not exposed by
  // dirents (Known Limitations). The client owns whether hidden rows show.
  return { name, path, hidden: name.startsWith('.') }
}

/**
 * Ancestor chain of a POSIX path, for a machine that is not this computer.
 *
 * Separate from {@link ancestryCrumbs} because that one uses this platform's
 * own path rules: a Windows host would otherwise split `/srv/build` on
 * backslashes and produce one crumb for a path with three levels.
 * @param target - an absolute POSIX path on the machine.
 * @returns the crumbs, root first and the target last.
 */
export function remoteCrumbs(target: string): DirectoryEntry[] {
  const crumbs: DirectoryEntry[] = [{ name: '/', path: '/', hidden: false }]
  let current = ''
  for (const segment of target.split('/')) {
    if (segment === '') continue
    current = `${current}/${segment}`
    crumbs.push({ name: segment, path: current, hidden: segment.startsWith('.') })
  }
  return crumbs
}

/** Validated plugin configuration. */
export interface Config {
  /** Complete-result bound of one listing level; see {@link BrowseDirectoryPicker.Config}. */
  maxEntries: number
}

/** The `ctx.directoryPicker` browse implementation (stable capability object per service life). */
export default class BrowseDirectoryPicker extends DirectoryPicker {
  /**
   * `maxEntries` bounds the complete listing level a single `list` call may
   * materialize and put on the wire: at most this many child-directory rows
   * (hidden rows included), with `truncated` flagging a cut level. The
   * default follows GitHub's web UI, which truncates directory listings at
   * 1,000 entries.
   */
  static Config: z<Config> = z.object({
    maxEntries: z.natural().min(1).default(1000),
  })

  private readonly browseCapability: DirectoryPickerCapability = {
    kind: 'browse',
    list: (path, signal) => this.list(path, signal),
    createDirectory: (path, name) => this.createDirectory(path, name),
  }

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx)
  }

  /**
   * The browse interaction capability.
   * @returns the stable `browse` capability object.
   */
  capability(): DirectoryPickerCapability {
    return this.browseCapability
  }

  /**
   * The filesystem to browse, when it is not this computer's.
   *
   * Undefined for the local machine and for a deployment that composes no
   * machine list — both of which the streaming path below serves. Read through
   * `ctx.get` rather than injected so neither service is required to browse
   * this computer.
   * @returns the routed filesystem, or undefined to browse locally.
   */
  private remoteFilesystem() {
    const machines = this.ctx.get('machines')
    if (machines === undefined || machines.current === LOCAL_MACHINE) return undefined
    return this.ctx.get('fs')
  }

  /**
   * One level of a machine that is not this computer.
   *
   * The whole level arrives in one call — the seam has no streaming listing,
   * and a per-child probe across a connection is what makes a folder take
   * seconds to open — so the bound is applied to what came back rather than
   * while it arrives. `truncated` still means the same thing to a reader: the
   * level has more in it than this answer shows.
   * @param path - the level to list, or undefined for the machine's own start.
   * @param signal - aborts the listing.
   * @returns the level, in the same shape the local path returns.
   */
  private async listRemote(
    filesystem: NonNullable<ReturnType<typeof this.remoteFilesystem>>,
    path: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<DirectoryListing> {
    // The provider's own working directory is where a person starts: it is
    // the machine's answer to "where is my work", and there is no `homedir()`
    // for a machine this process is not on.
    const start = await filesystem.resolve('.', signal === undefined ? {} : { signal })
    const home = filesystem.processPath(start)
    let target: FsTarget
    try {
      target = path === undefined ? start : await filesystem.resolve(path, signal === undefined ? {} : { signal })
    } catch (error: unknown) {
      throw new DirectoryPickerError('directory-unreadable', path ?? home, `cannot list "${path ?? home}": ${messageOf(error)}`)
    }
    const shown = filesystem.processPath(target)
    let children
    try {
      children = await filesystem.listDir(target, signal)
    } catch (error: unknown) {
      signal?.throwIfAborted()
      throw new DirectoryPickerError('directory-unreadable', shown, `cannot list ${shown}: ${messageOf(error)}`)
    }
    const directories = children.filter(child => child.type === 'directory')
    const entries = directories.slice(0, this.config.maxEntries).map(child => ({
      name: child.name,
      path: filesystem.processPath(child.target),
      // The POSIX convention, which is the only one a machine reached over a
      // shell has: the seam reports no Windows hidden attribute either.
      hidden: child.name.startsWith('.'),
    }))
    return {
      path: shown,
      home,
      // POSIX crumbs: the machine book documents a POSIX login shell, so a
      // remote path is a POSIX path however this computer spells its own.
      crumbs: remoteCrumbs(shown),
      entries,
      truncated: directories.length > entries.length,
    }
  }

  private async list(path?: string, signal?: AbortSignal): Promise<DirectoryListing> {
    const remote = this.remoteFilesystem()
    if (remote !== undefined) return await this.listRemote(remote, path, signal)
    const home = homedir()
    // The seam contract takes fully qualified paths only; resolve() would
    // silently rebase a relative or empty wire value under the host process
    // cwd (or, for rooted drive-less Windows forms, its current drive).
    if (path !== undefined && !fullyQualified(path)) {
      throw new DirectoryPickerError('directory-unreadable', path, `cannot list "${path}": not a fully qualified path`)
    }
    const target = resolve(path ?? home)
    // Stream the level (opendir, one dirent at a time) into a name-sorted
    // window of maxEntries + 1 candidates: memory stays bounded no matter how
    // many children the directory holds, the window keeps the name-sorted
    // head, and the +1 slot lets an in-window extra row prove the cut. A
    // window candidate that turns out non-enterable (broken symlink) is not
    // backfilled from beyond the window — an eviction already marks the
    // level truncated, which stays the honest answer.
    const keep = this.config.maxEntries + 1
    const window: ListingCandidate[] = []
    let evicted = false
    try {
      // Every filesystem await races the caller's signal: a stalled
      // opendir/read on a network filesystem must not keep a departed
      // caller's scan alive, and an already-aborted request rejects even
      // when the level is empty.
      const opening = opendir(target)
      const level = await raceAbort(opening, signal).catch((error: unknown) => {
        // The abandoned open can still mint a handle after the abort won;
        // close it so a departed caller cannot leak a descriptor. (A lost
        // race against opendir's own rejection has nothing to close, and
        // the close's own failure is swallowed — the request already
        // returned, so a cleanup error has no consumer.)
        void opening.then(dir => dir.close().catch(swallowCloseFailure), () => {
          // Already rejected: raceAbort surfaced or swallowed it.
        })
        throw error
      })
      try {
        for (;;) {
          const dirent = await raceAbort(level.read(), signal)
          if (dirent === null) break
          // Only rows a browser could enter contend for the window; dirent
          // says "directory" outright, a symlink needs the later stat probe.
          if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue
          const candidate = { name: dirent.name, isDirectory: dirent.isDirectory(), isSymbolicLink: dirent.isSymbolicLink() }
          if (boundedInsert(window, candidate, keep)) evicted = true
        }
      } finally {
        // Manual read() never auto-closes; close on every exit. The aborted
        // exit must not await it — Node queues close behind any in-flight
        // read, so awaiting would chain the departed caller back onto the
        // very stall the abort escaped (the abandoned read's settlement is
        // already swallowed by raceAbort).
        const closing = level.close()
        /* v8 ignore next 3 -- an abort between open and close needs a stalled read; the abandoned-close arm has no observable outcome. */
        if (signal?.aborted) {
          closing.catch(swallowCloseFailure)
        } else {
          await closing
        }
      }
    } catch (error: unknown) {
      // An abort is the caller's own reason, not an unreadable directory.
      signal?.throwIfAborted()
      throw new DirectoryPickerError('directory-unreadable', target, `cannot list ${target}: ${messageOf(error)}`)
    }
    const entries: DirectoryEntry[] = []
    let truncated = evicted
    for (const candidate of window) {
      // A caller that departed between reads and probes stops before the
      // next probe (each probe's own await is raced inside directoryRow).
      signal?.throwIfAborted()
      const row = await directoryRow(target, candidate.name, candidate.isDirectory, candidate.isSymbolicLink, signal)
      if (row === null) continue
      if (entries.length === this.config.maxEntries) {
        truncated = true
        break
      }
      entries.push(row)
    }
    return { path: target, home, crumbs: ancestryCrumbs(target), entries, truncated }
  }

  private async createDirectory(path: string, name: string): Promise<string> {
    const remote = this.remoteFilesystem()
    if (remote !== undefined) {
      // Optional on the seam, so a machine whose filesystem cannot create one
      // is told apart from a creation that failed.
      if (remote.createDirectory === undefined) {
        throw new DirectoryPickerError(
          'directory-create-failed',
          path,
          'this machine\'s filesystem cannot create folders',
        )
      }
      const parent = await remote.resolve(path)
      try {
        return remote.processPath(await remote.createDirectory(parent, name))
      } catch (error: unknown) {
        const target = `${path.replace(/\/+$/u, '')}/${name}`
        if (error instanceof FsError && error.code === 'FS_ALREADY_EXISTS') {
          throw new DirectoryPickerError('directory-exists', target, `${target} already exists`)
        }
        throw new DirectoryPickerError('directory-create-failed', target, `cannot create ${target}: ${messageOf(error)}`)
      }
    }
    // Same fully-qualified fence as list: never rebase a parent under the
    // cwd or the current drive.
    if (!fullyQualified(path)) {
      throw new DirectoryPickerError('directory-create-failed', path, `cannot create under "${path}": not a fully qualified parent path`)
    }
    const parent = resolve(path)
    // The backend owns segment validation (the wire schema also refuses these,
    // but direct service consumers must hit the same fence).
    if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
      throw new DirectoryPickerError('directory-create-failed', join(parent, name), `"${name}" is not a single path segment`)
    }
    const target = join(parent, name)
    try {
      // Non-recursive: the parent is the directory the browser is showing, so
      // a missing parent is a real failure, not a level to invent.
      await mkdir(target)
      return target
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
        throw new DirectoryPickerError('directory-exists', target, `${target} already exists`)
      }
      throw new DirectoryPickerError('directory-create-failed', target, `cannot create ${target}: ${messageOf(error)}`)
    }
  }
}
