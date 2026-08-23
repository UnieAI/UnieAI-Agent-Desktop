import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import * as SlotsInvariant from '@unieai/uad-client-ui-slots/invariant'
import InvariantRegistry from '@unieai/uad-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(SlotsInvariant).await()).resolves.toBeDefined()
  })
})
