/** UnieAI occupants for the generic browser-brand slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { UnieAiBrandMark, UnieAiBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill every shipped brand slot as one declaration-aware registration set.
 *
 * Unlike the upstream official-brand package this registers unconditionally:
 * the build profile selects DeepSeek's occupants, and a UnieAI build removes
 * that row from the roster rather than competing with it for the same cells.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, UnieAiBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, UnieAiBrandName)
    }))
}
