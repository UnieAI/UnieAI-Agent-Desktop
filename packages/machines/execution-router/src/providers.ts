/**
 * One execution world per machine, built when a machine is first used.
 *
 * Each world is a real provider constructed in an ISOLATED child context, so
 * several coexist: `ctx.isolate('fs')` gives a context whose `fs` slot is
 * separate from its parent's, which is what lets the router register itself
 * as the one `ctx.fs` while owning others privately.
 *
 * Construction is deliberately synchronous. A provider registers itself in
 * its constructor, and the subprocess seam publishes a live handle from a
 * synchronous `spawn` — a caller may write to the child's stdin on the next
 * line. Building a world through the plugin lifecycle would make that handle
 * a placeholder whose streams appear later, which no caller of that seam is
 * written to expect.
 *
 * Worlds are built lazily and kept: switching back to a machine finds its
 * connection still open, and a machine never used costs nothing.
 *
 * Each provider's own schema is applied here. Schema defaults are the plugin
 * lifecycle's work, and construction skips it — a provider handed a bare `{}`
 * would be missing every defaulted field and reject its own configuration.
 */

import { Context } from '@unieai/cordis'
import { LOCAL_MACHINE } from '@unieai/uad-machines'
import { LocalFileSystem } from '@unieai/uad-fs-local'
import { LocalSubprocessRuntime } from '@unieai/uad-subprocess-local'
import { SshFileSystem } from '@unieai/uad-fs-ssh'
import { SshSubprocessRuntime } from '@unieai/uad-subprocess-ssh'
import type { FileSystem } from '@unieai/uad-fs'
import type { SubprocessRuntime } from '@unieai/uad-subprocess'

/** What a remote world needs beyond its machine name. */
export interface RemoteWorldOptions {
  /** Directory on the machine that relative paths resolve against. */
  cwd: string
}

/**
 * Build one machine's filesystem provider.
 * @param ctx - the router's own context; the world is isolated from it.
 * @param machine - target id, `local` or an OpenSSH alias.
 * @param options - remote-world settings, used for a non-local machine.
 * @returns the provider.
 */
export function buildFileSystem(ctx: Context, machine: string, options: RemoteWorldOptions): FileSystem {
  const world = ctx.isolate('fs')
  return machine === LOCAL_MACHINE
    ? new LocalFileSystem(world, LocalFileSystem.Config({}))
    : new SshFileSystem(world, SshFileSystem.Config({ machine, cwd: options.cwd }))
}

/**
 * Build one machine's subprocess provider.
 * @param ctx - the router's own context; the world is isolated from it.
 * @param machine - target id, `local` or an OpenSSH alias.
 * @returns the provider.
 */
export function buildSubprocess(ctx: Context, machine: string): SubprocessRuntime {
  const world = ctx.isolate('subprocess')
  return machine === LOCAL_MACHINE
    ? new LocalSubprocessRuntime(world)
    : new SshSubprocessRuntime(world, { machine })
}
