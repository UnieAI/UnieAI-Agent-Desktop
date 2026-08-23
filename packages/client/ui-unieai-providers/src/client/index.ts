/**
 * UnieAI API Provider settings plugin, browser half: registers the API
 * Provider section, which mirrors the account's providers from the UnieAI
 * Copilot web product and can add one back to it.
 *
 * The section reads and writes the sign-in gate's `/auth/providers` routes.
 * That indirection is the point: the API key authenticating the product's
 * `/api/desktop/*` surface lives in the gate's session table on the host, and
 * must never reach a page. The browser asks the host, the host asks the
 * product. The provider credential a create carries travels the same way, and
 * nothing on the return path carries any credential at all.
 *
 * This section sits AFTER Models in the panel. Models is the desktop's own
 * provider surface over `settings.yaml` and is what a local agent actually
 * runs on; this one is the cloud account's list, and putting it second says
 * which of the two the desktop owns.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the settings slot declarations (the `settings.section` entry).
// Cross-plugin collaboration goes through slots and services, never a value
// import (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import { ProvidersSection } from './ProvidersSection.tsx'
import type { ProvidersSectionInjected } from './ProvidersSection.tsx'
import { ProviderSource } from './provider-source.ts'
import { en, ja, zh, zhTW } from './locales.ts'

export type { ProvidersSectionComponentProps, ProvidersSectionInjected } from './ProvidersSection.tsx'
export type { ProvidersKey } from './locales.ts'
export type {
  ProviderDraft, ProviderFailure, ProviderOutcome, ProviderPatch, ProviderRow, ProvidersState,
} from './provider-source.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.providers'

/** Nav position: after Models (10), which is the desktop's own provider page. */
const SECTION_ORDER = 15

/**
 * Required services (cordis fiber inject). `settings.section` is declared by
 * another package's apply, whose activation order relative to this one is NOT
 * constrained; the registration waits on the declaration through
 * `slots.inject()`.
 */
export const inject = ['slots', 'locale']

/**
 * Register the API Provider section and its dictionaries, and start its first
 * read.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-unieai-providers: copy dictionaries',
  )

  const source = new ProviderSource({ request: (path, init) => globalThis.fetch(path, init) })
  ctx.effect(() => () => { source.dispose() }, 'ui-unieai-providers: provider source')

  // Registration-time text (the nav label thunk) and the inject face share one
  // bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS)
  const injected = (): ProvidersSectionInjected => ({
    hooks: { providers: source },
    refresh: () => { void source.refresh() },
    create: draft => source.create(draft),
    update: (id, patch) => source.update(id, patch),
    remove: id => source.remove(id),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'unieai-providers',
    order: SECTION_ORDER,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ProvidersSection))

  // One read per document. The list also changes on the web product, where
  // nothing pushes to a desktop, so there is nothing to subscribe to; every
  // write from this page re-reads it, and the Retry control is how a reader
  // asks for a fresh one.
  void source.refresh()
}
