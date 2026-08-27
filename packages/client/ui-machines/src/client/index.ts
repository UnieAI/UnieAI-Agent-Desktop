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
import { MachineControl } from './MachineControl.tsx'
import type { MachineControlInjected } from './MachineControl.tsx'
import { createMachineView } from './machine-view.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type { MachineControlProps } from './MachineControl.tsx'
export { INITIAL_MACHINE_STATE, createMachineView } from './machine-view.ts'
export type { MachineRoutes, MachineState, MachineView } from './machine-view.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'conversation.machine'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection']

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

  ctx.slots.inject('conversation.input.chrome', () => ctx.slots.register({
    name: 'conversation.input.chrome',
    id: 'machine',
    // Before the wider controls: where work runs is read at a glance, and a
    // glance goes left first.
    order: 5,
    locale: NS,
    inject: (): MachineControlInjected => ({
      hooks: { machines: view },
      refresh: () => view.refresh(),
      select: machine => view.select(machine),
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
