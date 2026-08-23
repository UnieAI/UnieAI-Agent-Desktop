import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import InvariantRegistry from '@unieai/uad-invariants'
import * as UserIdInvariant from '@unieai/uad-anonymous-user-id/invariant'

describe('invariant companion', () => {
  it('registers the package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(UserIdInvariant).await()).resolves.toBeDefined()
  })
})
