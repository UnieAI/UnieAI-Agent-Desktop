/**
 * Where work happens: this computer, or a machine the person can reach.
 *
 * One service answers two questions a surface needs — which machines exist,
 * and which one is current — and remembers the answer to the second across
 * restarts. It holds no connection and runs no command; the execution-world
 * providers do that, and they ask this service which target to use.
 *
 * The machine list is not a list this package keeps. It is `local` plus the
 * aliases in the person's own OpenSSH configuration, read through `ctx.ssh`
 * on every call, because a second machine book is a second place to keep
 * correct.
 *
 * @module @unieai/uad-machines
 */

import { Context, Service } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { settingsNamespace } from '@unieai/uad-settings'
import type { SshEditRefusal, SshHostDraft, SshHostEntry, SshHosts } from '@unieai/uad-ssh'
import type { SettingsScope } from '@unieai/uad-settings'

export type { MachineTarget } from './types.ts'
import type { MachineTarget } from './types.ts'

declare module '@unieai/cordis' {
  interface Context {
    machines: Machines
  }
}

/** Id of this computer, which is always a target. */
export const LOCAL_MACHINE = 'local'

/** Settings namespace holding the current target. */
export const MACHINES_SETTINGS_NAMESPACE = 'machines'

/** The durable part: which machine work happens on. */
export interface MachineSettings {
  /** Current target id: `local`, or an alias from the OpenSSH configuration. */
  current: string
}

/** Schema for the durable section. */
export const MachineSettingsSchema: z<MachineSettings> = z.object({
  current: z.string().default(LOCAL_MACHINE),
})

/** Configuration for the machine list. */
export interface Config {
  /** How this computer is labelled in a picker. */
  localLabel?: string
}

/** Schema for the machine list. */
export const Config: z<Config> = z.object({
  localLabel: z.string().default('This computer'),
})

/**
 * The machines a person can work on, and the one they are working on now.
 */
export class Machines extends Service {
  /** Settings hold the current target; the machine book supplies the rest. */
  static inject = ['settings']

  /** This feature's durable section. */
  private readonly settings: SettingsScope<MachineSettings>

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'machines')
    this.settings = ctx.settings.register(
      settingsNamespace(MACHINES_SETTINGS_NAMESPACE),
      MachineSettingsSchema,
      {},
    )
  }

  /**
   * Every machine a person could pick.
   *
   * This computer is always first and always present: a deployment with no
   * OpenSSH configuration still has somewhere to work, and a person who has
   * lost access to every remote machine can still get back.
   * @param signal - aborts reading the machine book.
   * @returns the targets, in picking order.
   */
  async list(signal?: AbortSignal): Promise<MachineTarget[]> {
    const local: MachineTarget = {
      id: LOCAL_MACHINE,
      label: this.config.localLabel ?? 'This computer',
      kind: 'local',
    }
    const ssh = this.ctx.get('ssh')
    if (ssh === undefined) return [local]
    const entries: readonly SshHostEntry[] = await ssh.list()
    void signal
    // Duplicate aliases are possible across included files; the first wins,
    // as it does for OpenSSH itself.
    const seen = new Set<string>([LOCAL_MACHINE])
    const remote: MachineTarget[] = []
    for (const entry of entries) {
      if (seen.has(entry.alias)) continue
      seen.add(entry.alias)
      remote.push({ id: entry.alias, label: entry.alias, kind: 'ssh', source: entry.source })
    }
    return [local, ...remote]
  }

  /**
   * The machine work happens on right now.
   *
   * Read from settings on every call rather than cached: a person changing
   * machines is exactly the moment a stale answer is wrong.
   * @returns the current target id.
   */
  get current(): string {
    return this.settings.get().current
  }

  /**
   * Work on another machine from now on.
   *
   * An unknown id is refused, naming what is available: a target that no
   * configuration mentions cannot be connected to, and storing it would
   * leave the person with a Rabi that fails every command until they find
   * the setting again.
   * @param id - the target to work on.
   * @returns resolution after the choice is durable.
   */
  async select(id: string): Promise<void> {
    const available = await this.list()
    if (!available.some(target => target.id === id)) {
      const names = available.map(target => target.id).join(', ')
      throw new Error(`unknown machine '${id}'; available: ${names}`)
    }
    await this.settings.update({ current: id })
  }

  /**
   * Write one machine into the person's own OpenSSH configuration.
   * @param draft - the machine to add.
   * @returns nothing, or the refusal that stopped it.
   * @throws when no machine book is composed, which is a composition error rather than a person's mistake.
   */
  add(draft: SshHostDraft): Promise<SshEditRefusal | undefined> {
    return this.requireBook().add(draft)
  }

  /**
   * Remove one machine from the person's own configuration.
   *
   * Switching back to this computer first when the machine being removed is
   * the current one: leaving it selected would point every later command at
   * a machine that is no longer written down anywhere.
   * @param id - the machine to remove.
   * @returns nothing, or the refusal that stopped it.
   * @throws when no machine book is composed.
   */
  async remove(id: string): Promise<SshEditRefusal | undefined> {
    const listed = await this.list()
    const target = listed.find(machine => machine.id === id)
    const refusal = await this.requireBook().remove(id, target?.source)
    if (refusal === undefined && this.current === id) await this.settings.update({ current: LOCAL_MACHINE })
    return refusal
  }

  /**
   * Ask whether one machine answers right now.
   * @param id - the machine to reach.
   * @param signal - aborts the attempt.
   * @returns reachability, with the client's own message when it failed.
   * @throws when no machine book is composed.
   */
  probe(id: string, signal?: AbortSignal): Promise<{ reachable: boolean; message: string }> {
    return this.requireBook().probe(id, signal)
  }

  /**
   * The machine book, or a loud failure.
   * @returns the book.
   * @throws when the composition has none, which no person's action can fix.
   */
  private requireBook(): SshHosts {
    const ssh = this.ctx.get('ssh')
    if (ssh === undefined) throw new Error('machines: this deployment composes no ssh machine book')
    return ssh
  }

  /**
   * Observe changes to the current machine.
   * @param callback - invoked after each committed change with the new target id.
   * @returns the disposer removing this observer.
   */
  watch(callback: (id: string) => void): () => void {
    return this.settings.watch((next, prev) => {
      if (next.current !== prev.current) callback(next.current)
    })
  }
}

export default Machines
