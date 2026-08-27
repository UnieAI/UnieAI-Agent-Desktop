/**
 * The execution world, routed to the machine a person is working on.
 *
 * Mounted in place of a single provider pair, these two register `ctx.fs` and
 * `ctx.subprocess` and forward every call to the provider for one machine —
 * this computer, or one reached over SSH. Nothing above the seams changes:
 * the Bash tool, the file tools, search, language servers and terminals keep
 * consuming two interfaces, and the machine they land on becomes a choice a
 * person makes rather than a composition decision made at boot.
 *
 * Both providers must be mounted together and must agree, because they are
 * one execution world: a filesystem on one machine and commands on another
 * would break the seam's central promise in a way no consumer could detect.
 *
 * @module @unieai/uad-execution-router
 */

import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { FileSystem } from '@unieai/uad-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsVersion,
  FsWriteIntent,
  FsWriteOutcome,
} from '@unieai/uad-fs'
import { SubprocessRuntime } from '@unieai/uad-subprocess'
import type {
  SubprocessHandle,
  SubprocessSpawnSpec,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@unieai/uad-subprocess'
import type { SandboxExecutionPolicy } from '@unieai/uad-sandbox'
import { buildFileSystem, buildSubprocess } from './providers.ts'
import { machineOfTarget } from './targets.ts'

export { buildFileSystem, buildSubprocess } from './providers.ts'
export type { RemoteWorldOptions } from './providers.ts'
export { machineOfTarget } from './targets.ts'

/** Configuration shared by both routed providers. */
export interface Config {
  /**
   * Directory on a remote machine that relative paths resolve against.
   *
   * The login directory by default, because that is where a fresh
   * `ssh <alias>` puts a person.
   */
  remoteCwd?: string
}

/** Schema for the routed providers. */
export const Config: z<Config> = z.object({
  remoteCwd: z.string().default('.'),
})

/**
 * Keeps one built world per machine, built on first use.
 * @param build - constructs the world for one machine.
 * @returns a function returning that machine's world, building it once.
 */
function worldCache<T>(build: (machine: string) => T): (machine: string) => T {
  const worlds = new Map<string, T>()
  return (machine) => {
    // What is cached for an async build is the PROMISE: two calls racing on
    // a machine's first use must share one world rather than mount two.
    const existing = worlds.get(machine)
    if (existing !== undefined) return existing
    const created = build(machine)
    worlds.set(machine, created)
    return created
  }
}

/**
 * The filesystem of whichever machine a call belongs to.
 */
export class RoutedFileSystem extends FileSystem {
  /** The machine list answers which target is current. */
  static inject = ['machines']

  private readonly world: (machine: string) => Promise<FileSystem>

  /**
   * Worlds already built, for the three methods this seam answers
   * synchronously. Every target they receive came from an async call that
   * built its world, so the entry is there by the time they are asked.
   */
  private readonly built = new Map<string, FileSystem>()

  constructor(ctx: Context, public routerConfig: Config = {}) {
    super(ctx)
    this.world = worldCache(async (machine) => {
      const provider = await buildFileSystem(ctx, machine, { cwd: routerConfig.remoteCwd ?? '.' })
      this.built.set(machine, provider)
      return provider
    })
  }

  /** The world a path-addressed or ambient call belongs to. */
  private currentWorld(): Promise<FileSystem> {
    return this.world(this.ctx.machines.current)
  }

  /** The world a target-addressed call belongs to, read from the target itself. */
  private targetWorld(target: FsTarget): Promise<FileSystem> {
    return this.world(machineOfTarget(String(target.targetKey)))
  }

  /**
   * The already-built world one target came from.
   * @param target - a target this router handed out.
   * @returns its world.
   * @throws when no call has built that machine's world, which a target from
   * this router cannot be true of.
   */
  private builtWorld(target: FsTarget): FileSystem {
    const machine = machineOfTarget(String(target.targetKey))
    const world = this.built.get(machine)
    if (world === undefined) throw new Error(`no filesystem is mounted for machine '${machine}'`)
    return world
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    return (await this.currentWorld()).resolve(path, opts)
  }

  /**
   * The canonical path a subprocess in the SAME world can open.
   * @param target - the resolved target.
   * @returns the path, in its own machine's namespace.
   */
  override processPath(target: FsTarget): string {
    return this.builtWorld(target).processPath(target)
  }

  override fileUrl(target: FsTarget): string {
    return this.builtWorld(target).fileUrl(target)
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    // Containment across machines is false rather than an error: asking
    // whether a directory here holds a file there is a fair question with a
    // plain answer.
    const machine = machineOfTarget(String(parent.targetKey))
    if (machine !== machineOfTarget(String(child.targetKey))) return false
    return this.builtWorld(parent).contains(parent, child)
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return (await this.targetWorld(target)).stat(target, signal)
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    return (await this.currentWorld()).lstat(path, opts, signal)
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return (await this.targetWorld(target)).readText(target, signal)
  }

  override async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return (await this.targetWorld(target)).streamText(target, signal)
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return (await this.targetWorld(target)).readBytes(target, signal, maxBytes)
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    return (await this.targetWorld(target)).listDir(target, signal)
  }

  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    return (await this.targetWorld(target)).writeText(target, content, expected, signal, sandboxPolicy)
  }

  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    return (await this.targetWorld(target)).editText(target, edit, expected, signal, sandboxPolicy)
  }

}

/**
 * The processes of whichever machine a person is working on.
 */
export class RoutedSubprocessRuntime extends SubprocessRuntime {
  /** The machine list answers which target is current. */
  static inject = ['machines']

  private readonly world: (machine: string) => SubprocessRuntime

  constructor(ctx: Context, public routerConfig: Config = {}) {
    super(ctx)
    this.world = worldCache(machine => buildSubprocess(ctx, machine))
  }

  /**
   * Every process call is ambient: a command carries no target to read a
   * machine from, so it runs where the person is working.
   * @returns the current machine's subprocess provider.
   */
  private currentWorld(): SubprocessRuntime {
    return this.world(this.ctx.machines.current)
  }

  override resolveExecutable(
    command: string,
    env?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.currentWorld().resolveExecutable(command, env, signal)
  }

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    return this.currentWorld().spawn(spec)
  }

  override spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return this.currentWorld().spawnTerminal(spec)
  }
}

export default RoutedFileSystem
