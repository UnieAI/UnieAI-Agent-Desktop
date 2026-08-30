/**
 * The machine control, browser half.
 *
 * Registers one small control in the composer's tool row: which machine the
 * work happens on, and a menu to change it. The machines themselves come
 * from the host — they are read from the person's own OpenSSH configuration
 * — and switching is a host call, because the execution world is the host's.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
import type { ConnectionHandle } from '@unieai/uad-api-remotes/client'
// Type-only: the composer seat is declared by the conversation package;
// cross-plugin collaboration goes through slots (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
// Type-only: brings ctx.settingsScope, where each machine's workspace is kept.
import type {} from '@unieai/uad-client-ui-settings/client'
import { MachineControl } from './MachineControl.tsx'
import type { MachineControlInjected } from './MachineControl.tsx'
import { createMachineView } from './machine-view.ts'
import { en, ja, zh, zhTW } from './locales.ts'
import {
  MACHINES_SETTINGS_NAMESPACE, WORKSPACE_BY_MACHINE_FIELD, type MachineWorkspaceMemory,
} from '../machine-settings.ts'

export type { MachineControlProps } from './MachineControl.tsx'
export { INITIAL_MACHINE_STATE, createMachineView } from './machine-view.ts'
export type { MachineRoutes, MachineState, MachineView } from './machine-view.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'conversation.machine'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'workspaces', 'settingsScope']

/**
 * Register the machine control.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-machines: copy dictionaries',
  )

  const host = (ctx.get('connection') as ConnectionHandle).api.host
  const view = createMachineView({
    list: async () => {
      const response = await host.listMachines({})
      return response.result.ok
        ? { ok: true as const, ...response.result.value }
        : { ok: false as const, message: response.result.error.message }
    },
    select: async (machine) => {
      const response = await host.selectMachine({ machine })
      return response.result.ok
        ? { ok: true as const, ...response.result.value }
        : { ok: false as const, message: response.result.error.message }
    },
    add: async (draft) => {
      const response = await host.addMachine(draft)
      return response.result.ok
        ? { ok: true as const, ...response.result.value }
        : { ok: false as const, message: response.result.error.message }
    },
    remove: async (machine) => {
      const response = await host.removeMachine({ machine })
      return response.result.ok
        ? { ok: true as const, ...response.result.value }
        : { ok: false as const, message: response.result.error.message }
    },
    probe: async (machine) => {
      const response = await host.probeMachine({ machine })
      return response.result.ok
        ? response.result.value
        : { reachable: false, message: response.result.error.message }
    },
  })


  const settings = ctx.settingsScope.bind<MachineWorkspaceMemory>({
    namespace: MACHINES_SETTINGS_NAMESPACE,
  })

  /**
   * Keep each machine's own place across a switch.
   *
   * A workspace is a path and a path belongs to one machine: the folder picked
   * on a GPU host is not on the laptop, so carrying it across a switch aims the
   * next command at a directory that is not there. The machine being left has
   * its workspace recorded, and the machine being entered gets the one it was
   * last in.
   *
   * A machine nobody has worked on yet keeps whatever is already open rather
   * than emptying the screen: there is nothing to restore, and "no workspace"
   * is a state a person chooses, not one a switch should impose. A remembered
   * workspace that no longer exists is skipped for the same reason.
   * @param before - the machine being left.
   * @param after - the machine now in use.
   */
  async function carryWorkspace(before: string, after: string): Promise<void> {
    const workspaces = ctx.workspaces.list.getSnapshot()
    const remembered = { ...settings.getSnapshot().value?.workspaceByMachine }
    const leaving = workspaces.recentWorkspaceId
    if (leaving !== undefined) remembered[before] = leaving
    // Written before the restore: the record of where someone has been is
    // worth keeping even if reopening the other machine's workspace fails.
    await settings.set(WORKSPACE_BY_MACHINE_FIELD, remembered)
    const target = remembered[after]
    if (target === undefined || target === workspaces.recentWorkspaceId) return
    if (!workspaces.items.some(workspace => workspace.workspaceId === target)) return
    ctx.workspaces.startSession(target as typeof workspaces.items[number]['workspaceId'])
  }

  ctx.slots.inject('conversation.input.chrome.end', () => ctx.slots.register({
    name: 'conversation.input.chrome.end',
    id: 'machine',
    // First in the icon cluster, so the send button stays the row's last
    // control and the machine reads as chrome rather than as an action.
    order: 5,
    locale: NS,
    inject: (): MachineControlInjected => ({
      hooks: { machines: view },
      refresh: () => view.refresh(),
      select: async (machine) => {
        const before = view.getSnapshot().current
        await view.select(machine)
        const after = view.getSnapshot().current
        // Only a real move is announced: a refused switch and a re-pick of the
        // machine already in use both leave the world where it was.
        if (after === before) return
        ctx.emit('machines/changed', after)
        await carryWorkspace(before, after)
      },
      add: draft => view.add(draft),
      remove: machine => view.remove(machine),
      probe: machine => view.probe(machine),
      // Editing the configuration is the person's own editor's job; the file
      // to open is the one that declared a machine, because that is the file
      // they are actually keeping their machines in.
      openConfig: async () => {
        const source = view.getSnapshot().machines.find(machine => machine.source !== undefined)?.source
        if (source === undefined) return
        await host.openPath({ path: source })
      },
    }),
  }, MachineControl))
}
