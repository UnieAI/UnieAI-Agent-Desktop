import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import InvariantRegistry from '@unieai/uad-invariants'
import * as UpstreamNamesInvariant from '../src/invariant.ts'

describe('upstream-names invariant companion', () => {
  it('registers its explained empty runtime invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(UpstreamNamesInvariant)

    expect(() => {
      ctx.invariants.register('@unieai/uad-upstream-names', () => {})
    }).toThrow(/already registered/)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
