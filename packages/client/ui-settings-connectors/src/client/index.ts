/**
 * Connections settings surface, browser half.
 *
 * Everything on this page is the host's: which connectors exist, whether one
 * is connected, and the approval itself, which the host runs because the
 * redirect it listens on is a loopback address only the computer running Rabi
 * can reach. This half asks, renders, and stops asking.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ConnectionHandle } from '@unieai/uad-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.section' entry).
// Cross-plugin collaboration goes through services, never a value import.
import type {} from '@unieai/uad-client-ui-settings/client'
import { ConnectorsSection } from './ConnectorsSection.tsx'
import type { ConnectorsSectionInjected } from './ConnectorsSection.tsx'
import { createConnectorsView } from './connector-view.ts'
import { en, ja, zh, zhTW, type ConnectorsLocaleKey } from './locales.ts'

export { ConnectorsSection, expiryDay } from './ConnectorsSection.tsx'
export type { ConnectorsSectionInjected, ConnectorsSectionProps } from './ConnectorsSection.tsx'
export { ConnectorMark } from './ConnectorMark.tsx'
export { createConnectorsView, INITIAL_CONNECTORS_STATE } from './connector-view.ts'
export type {
  ConnectAnswer, ConnectorRoutes, ConnectorsActions, ConnectorsAnswer, ConnectorsState, ConnectorsView,
} from './connector-view.ts'
export type { ConnectorsLocaleKey } from './locales.ts'

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Connections settings page copy. */
    'settings.connectors': ConnectorsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.connectors'

/** Nav position: after Notifications (5) and before Models (10). */
const SECTION_ORDER = 7

/**
 * Required services (cordis fiber inject). `settings.section` is declared by
 * the settings shell, whose activation order relative to this one is NOT
 * constrained; the registration waits on the declaration through
 * `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the Connections section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-settings-connectors: copy dictionaries',
  )

  const t = ctx.locale.bind(NS)
  const host = (ctx.get('connection') as ConnectionHandle).api.host
  const view = createConnectorsView({
    list: async () => {
      const response = await host.listConnectors({})
      return response.result.ok
        ? { ok: true as const, connectors: response.result.value.connectors }
        : { ok: false as const, message: response.result.error.message }
    },
    connect: async (connector, signal) => {
      const response = await host.connectConnector({ connector }, signal)
      return response.result.ok
        ? { ok: true as const, connector: response.result.value }
        : { ok: false as const, message: response.result.error.message }
    },
    disconnect: async (connector) => {
      const response = await host.disconnectConnector({ connector })
      return response.result.ok
        ? { ok: true as const, connectors: response.result.value.connectors }
        : { ok: false as const, message: response.result.error.message }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'connectors',
    order: SECTION_ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: (): ConnectorsSectionInjected => ({
      hooks: { connectors: view },
      refresh: () => { void view.refresh() },
      locale: () => ctx.locale.getLocale().active,
      connect: (connector) => { void view.connect(connector) },
      cancel: () => { view.cancel() },
      disconnect: (connector) => { void view.disconnect(connector) },
      dismissError: () => { view.dismissError() },
    }),
  }, ConnectorsSection))
}
