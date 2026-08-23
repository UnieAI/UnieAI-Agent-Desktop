/**
 * The package's invariant companion registers its name and installs nothing:
 * this surface owns no durable data and emits no event stream.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as NotificationsInvariant from '../src/invariant.ts'

describe('ui-settings-notifications invariant companion', () => {
  it('registers the empty installer and keeps the node half inert', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(NotificationsInvariant).await()).resolves.toBeDefined()
    const { apply } = await import('../src/index.ts')
    expect(() => { apply() }).not.toThrow()
    await ctx.fiber.dispose()
  })
})
