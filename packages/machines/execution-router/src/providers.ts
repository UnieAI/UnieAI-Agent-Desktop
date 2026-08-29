/**
 * One execution world per machine, built when a machine is first used.
 *
 * Each world is a real provider constructed in an ISOLATED child context, so
 * several coexist: `ctx.isolate('fs')` gives a context whose `fs` slot is
 * separate from its parent's, which is what lets the router register itself
 * as the one `ctx.fs` while owning others privately.
 *
 * The two seams are built differently, and the reason is what each promises.
 *
 * A FILESYSTEM world is mounted as a plugin, because its providers declare
 * injections — the sandboxed local one needs `sandboxPolicy`, the remote one
 * needs the machine book — and only the plugin lifecycle honours a declared
 * injection. Constructing such a provider by hand leaves those reads refused
 * by the context proxy (`cannot get property "sandboxPolicy" without
 * inject`), which surfaces as a filesystem that quietly answers nothing.
 * Every method that matters there is async already, so waiting for the mount
 * costs nothing a caller can observe.
 *
 * A SUBPROCESS world is constructed directly, because `spawn` publishes a
 * live handle synchronously — a caller may write to the child's stdin on the
 * next line, and a placeholder whose streams appear later is not what that
 * seam promises. The local runtime declares no injections, and the remote one
 * is handed its machine book instead of reading an undeclared service.
 *
 * Worlds are built lazily and kept: switching back to a machine finds its
 * connection still open, and a machine never used costs nothing.
 *
 * Each directly-constructed provider's own schema is applied here. Schema
 * defaults are the plugin lifecycle's work, and construction skips it — a
 * provider handed a bare `{}` would be missing every defaulted field and
 * reject its own configuration.
 */

import { Context } from '@unieai/cordis'
import { LOCAL_MACHINE } from '@unieai/uad-machines'
import { LocalFileSystem } from '@unieai/uad-fs-local'
import { SandboxedFileSystem } from '@unieai/uad-fs-sandbox'
import { LocalSubprocessRuntime } from '@unieai/uad-subprocess-local'
import { SshFileSystem } from '@unieai/uad-fs-ssh'
import { SshSubprocessRuntime } from '@unieai/uad-subprocess-ssh'
import type { SshHosts } from '@unieai/uad-ssh'
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
export async function buildFileSystem(
  ctx: Context,
  machine: string,
  options: RemoteWorldOptions,
): Promise<FileSystem> {
  const world = ctx.isolate('fs')
  if (machine !== LOCAL_MACHINE) {
    await world.plugin(SshFileSystem, { machine, cwd: options.cwd })
  } else if (ctx.get('sandboxPolicy') === undefined) {
    await world.plugin(LocalFileSystem, {})
  } else {
    // This computer keeps the fence it already had. A composition that
    // mounts a sandbox policy expects writes to be confined by it, and
    // routing must not be the thing that quietly removes that — while a
    // remote machine has no local fence to apply, which its provider
    // documents.
    await world.plugin(SandboxedFileSystem, {})
  }
  const provider = world.get('fs')
  if (provider === undefined) throw new Error(`machine '${machine}' has no filesystem provider`)
  return provider
}

/**
 * Build one machine's subprocess provider.
 * @param ctx - the router's own context; the world is isolated from it.
 * @param machine - target id, `local` or an OpenSSH alias.
 * @returns the provider.
 */
export function buildSubprocess(ctx: Context, machine: string): SubprocessRuntime {
  const world = ctx.isolate('subprocess')
  if (machine === LOCAL_MACHINE) return new LocalSubprocessRuntime(world)
  // HANDED IN, NOT READ. This provider is constructed rather than mounted, so
  // its `static inject = ['ssh']` never runs — and the isolated world it is
  // built on refuses an undeclared read with `cannot get property "ssh"
  // without inject`. That refusal reaches a person as EVERY command failing,
  // including a local `echo`, because a routed world sends all of them through
  // here once a remote machine is picked.
  //
  // `reflect.get(name, false)` is cordis' non-throwing lookup, so a
  // composition with no machine book is refused by its own name instead of by
  // a message about injection.
  const hosts = ctx.reflect.get('ssh', false) as SshHosts | undefined
  if (hosts === undefined) {
    throw new Error(
      `machine '${machine}' cannot be reached: this composition mounts no machine book (ctx.ssh), `
      + 'so there is nothing that knows how to connect to it.',
    )
  }
  return new SshSubprocessRuntime(world, { machine }, hosts)
}
