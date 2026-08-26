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
 * This list renders INSIDE the Models page, above the desktop's own rows,
 * through the `settings.models.account` slot. It used to be a settings section
 * of its own, which made two pages that both said "add a provider" while
 * meaning different stores, different credentials, and different billing: a
 * row here is metered by the account and follows the person to every client
 * signed into it, a row on the Models page keeps its key on this machine and
 * is metered by nobody. One page names that difference; two pages hid it.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the Models page's slot declaration (`settings.models.account`).
// Cross-plugin collaboration goes through slots and services, never a value
// import (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-settings-models/client'
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

/** Order within the Models page: first, above the machine's own rows. */
const LIST_ORDER = 10

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

  // The list has no registration-time text of its own now: the page it renders
  // into owns the nav label, and every string inside the list comes from the
  // locale seat the slot binds.
  const injected = (): ProvidersSectionInjected => ({
    hooks: { providers: source },
    refresh: () => { void source.refresh() },
    create: draft => source.create(draft),
    update: (id, patch) => source.update(id, patch),
    remove: id => source.remove(id),
  })

  ctx.slots.inject('settings.models.account', () => ctx.slots.register({
    name: 'settings.models.account',
    id: 'unieai-providers',
    order: LIST_ORDER,
    locale: NS,
    inject: injected,
  }, ProvidersSection))

  // One read per document. The list also changes on the web product, where
  // nothing pushes to a desktop, so there is nothing to subscribe to; every
  // write from this page re-reads it, and the Retry control is how a reader
  // asks for a fresh one.
  void source.refresh()
}
