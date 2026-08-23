/**
 * Cordis plugin surface, browser half — one area on the Plugins page whose
 * feature-owned tabs include configurable Host plugin cards and read-only
 * inventory.
 *
 * The area declares `settings.plugins.tab`; its own `configurable` tab then
 * declares `settings.plugin.item` and renders whatever cards were registered
 * into it. The three cards this package ships are the host-plane sections the
 * deployment already exposes; each binds its namespace through the client
 * settings scope, which keeps them unaware of one another and of other tabs.
 *
 * It used to be a `settings.section`. It is now a `plugins.page.area`, which
 * is the same shape of seat on a different surface: nothing inside the
 * section, the tabs, or the cards changed, and the settings scope it writes
 * through is the same one. The reason is naming, not behaviour — see the
 * package README.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings shell's SlotMap merge (the 'settings.plugins.tab'
// entry type) and the ctx.settingsScope Context merge. Cross-plugin
// collaboration goes through the service, never a value import (client bundle
// purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.page.area' seat
// this section now occupies).
import type {} from '@deepseek-ai/dsh-client-ui-plugins-page/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { AgentLoopCard } from './AgentLoopCard.tsx'
import { BashCard } from './BashCard.tsx'
import { ConfigurablePluginsTab } from './ConfigurablePluginsTab.tsx'
import { PluginsSettingsSection } from './PluginsSettingsSection.tsx'
import type { PluginsSettingsSectionInjected, PluginsSettingsTabEntry } from './PluginsSettingsSection.tsx'
import { WebSearchCard } from './WebSearchCard.tsx'
import { AGENT_LOOP_NS, AgentLoopCardController } from './agent-loop-card-controller.ts'
import { SHELL_NS, BashCardController } from './bash-card-controller.ts'
import { ConfigurablePluginsTabController } from './tab-store.ts'
import { WEB_SEARCH_NS, WebSearchCardController } from './web-search-card-controller.ts'
import { en, zh } from './locales.ts'

export type { PluginsSettingsSectionInjected, PluginsSettingsSectionProps } from './PluginsSettingsSection.tsx'
export type { ConfigurablePluginsTabProps } from './ConfigurablePluginsTab.tsx'
export type { ConfigurablePluginsTabFace, ConfigurablePluginsTabState } from './tab-store.ts'
export type { PluginCardProps } from './PluginCard.tsx'
export type { SettingsPluginItemOwnerProps } from './slot-contract.ts'
export type { FieldProps } from './fields.tsx'
export type {
  CardActions, CardFieldSpec, CardFieldState, CardSecretSpec, CardShell,
} from './card-form.ts'
export type { AgentLoopCardFace, AgentLoopCardState } from './agent-loop-card-controller.ts'
export type { BashCardFace, BashCardState } from './bash-card-controller.ts'
export type { WebSearchCardFace, WebSearchCardState } from './web-search-card-controller.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.plugins'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Mount the plugin configuration section and the cards this package ships.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { 'zh-CN': zh, en }), 'ui-settings-plugins: section dictionaries')

  const bash = new BashCardController(ctx.settingsScope.bind({ namespace: SHELL_NS }))
  const agentLoop = new AgentLoopCardController(ctx.settingsScope.bind({ namespace: AGENT_LOOP_NS }))
  const webSearch = new WebSearchCardController(ctx.settingsScope.bind({ namespace: WEB_SEARCH_NS }), api)

  // The credential a card reports is not part of any settings section, so its
  // scope publishes nothing when one is written. This is the only signal that
  // a key written on another surface reached the Host.
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref) => { webSearch.refreshCredential(ref) }),
    'ui-settings-plugins: credential invalidations',
  )

  // Which namespaces the Host serves comes from the shared describe mirror,
  // whose owning plugin already refreshes it on document commits and
  // reconnects — the tab only derives.
  const configurable = new ConfigurablePluginsTabController(
    ctx.settingsScope.describe(), () => ctx.slots.entries('settings.plugin.item'))
  ctx.effect(() => () => { configurable.dispose() }, 'ui-settings-plugins: tab directory')
  // A card registered after the first read joins the list without a wire call.
  ctx.effect(
    () => ctx.slots.subscribe('settings.plugin.item', () => { configurable.refresh() }),
    'ui-settings-plugins: card ledger',
  )

  let tabsVersion = -1
  let tabsRevision = -1
  let tabs: readonly PluginsSettingsTabEntry[] = []
  const sectionInjected = (): PluginsSettingsSectionInjected => ({
    hooks: {
      tabs: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.plugins.tab')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== tabsVersion || revision !== tabsRevision) {
            tabsVersion = version
            tabsRevision = revision
            tabs = ctx.slots.entries('settings.plugins.tab')
              .map(entry => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: entry.options.id ?? '',
                order: entry.options.order ?? 0,
                label: resolveSlotLabel(entry.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return tabs
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.plugins.tab', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
    },
  })

  // This surface is an area on the Plugins PAGE, not a section in the
  // settings dialog. It moved there because "plugin" meant two things in this
  // product and only one of them was reachable from the sidebar's Plugins row:
  // this deployment registry is the developer-facing one, and it must not be
  // what that row opens on its own. Nothing about the section itself changed —
  // the same component, the same tabs, the same cards.
  //
  // The move also retires the settings shell's own Plugins nav row without
  // touching it: that row renders only while a `plugins` settings section
  // exists, and after this registration none does.
  ctx.slots.inject('plugins.page.area', () => ctx.slots.register({
    name: 'plugins.page.area',
    id: 'cordis-plugins',
    order: 10,
    locale: NS,
    inject: sectionInjected,
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  }, PluginsSettingsSection))

  // The existing configuration page is one ordinary tab. It keeps ownership
  // of the card slot and the three shipped card contributions below.
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'configurable',
    order: 0,
    label: () => t('configurableTab'),
    locale: NS,
    inject: () => configurable.inject(),
    children: { 'settings.plugin.item': { kind: 'keyed', scope: 'root' } },
  }, ConfigurablePluginsTab))

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: SHELL_NS,
      locale: NS,
      inject: () => bash.inject(),
    }, BashCard)
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: AGENT_LOOP_NS,
      locale: NS,
      inject: () => agentLoop.inject(),
    }, AgentLoopCard)
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: WEB_SEARCH_NS,
      locale: NS,
      inject: () => webSearch.inject(),
    }, WebSearchCard)
  })
}
