/**
 * Studio knowledge-base citations, browser half.
 *
 * Registers one occupant in the details panel's per-call annotation list. It
 * sees every call the person opens and renders only for the knowledge-base
 * ones, because the wire name of an MCP tool carries a server name the
 * deployment chose — there is no key to register under.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: the annotation hole is declared by the panel that renders it;
// cross-plugin collaboration goes through slots (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
import { StudioSources } from './StudioSources.tsx'
import { en, ja, zh, zhTW } from './locales.ts'

export type { StudioSourcesProps } from './StudioSources.tsx'
export { resultTextOf, sourcesFor } from './sources.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'conversation.studioSources'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Register the citations block.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-studio-sources: copy dictionaries',
  )

  ctx.slots.inject('conversation.details.tool.annotation', () => ctx.slots.register({
    name: 'conversation.details.tool.annotation',
    id: 'studio-kb-sources',
    locale: NS,
  }, StudioSources))
}
