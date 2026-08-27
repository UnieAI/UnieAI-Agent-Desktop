/**
 * The machine gauges, browser half.
 *
 * Registers one strip in the session header, immediately before the view
 * switch: what the machine this conversation runs on is doing right now. The
 * numbers are the host's — sampled on the machine itself through the same
 * execution seam a command runs on — so a session pointed at a build box
 * reports that box without this package knowing machines exist.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
import type { ConnectionHandle } from '@unieai/uad-api-remotes/client'
// Type-only: the header seat is declared by the conversation package;
// cross-plugin collaboration goes through slots (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import { MachineGauges } from './MachineGauges.tsx'
import type { MachineGaugesInjected } from './MachineGauges.tsx'
import { createGaugesView } from './gauges-view.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type { MachineGaugesProps } from './MachineGauges.tsx'
export { INITIAL_GAUGES, POLL_INTERVAL_MS, createGaugesView, formatBytes, gaugesOf } from './gauges-view.ts'
export type {
  Gauge, GaugesEnvironment, GaugesRoutes, GaugesState, GaugesView,
} from './gauges-view.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'conversation.gauges'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the machine gauges.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-machine-gauges: copy dictionaries',
  )

  const host = (ctx.get('connection') as ConnectionHandle).api.host
  const view = createGaugesView({
    read: async () => {
      const response = await host.machineMetrics({})
      return response.result.ok
        ? { ok: true as const, reading: response.result.value }
        : { ok: false as const, code: response.result.error.code, message: response.result.error.message }
    },
  }, {
    setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: (handle) => { globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>) },
    // A hidden tab is someone who is not looking, and each reading is a
    // command run on their machine.
    visible: () => globalThis.document.visibilityState !== 'hidden',
  })

  ctx.slots.inject('conversation.session.header.gauges', () => ctx.slots.register({
    name: 'conversation.session.header.gauges',
    id: 'machine-gauges',
    order: 0,
    locale: NS,
    inject: (): MachineGaugesInjected => ({
      hooks: { gauges: view },
      startPolling: () => view.start(),
    }),
  }, MachineGauges))
}
