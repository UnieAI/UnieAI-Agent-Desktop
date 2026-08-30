/**
 * The invariant companion reserves this package's ownership and installs
 * nothing, because the package owns no durable data of its own.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@unieai/cordis'
import { apply, inject, name } from '../src/invariant.ts'

describe('ui-settings-connectors invariant companion', () => {
  it('reserves the package name and installs an empty check', async () => {
    const register = vi.fn(() => () => {})
    const ctx = { invariants: { register } } as unknown as Context

    const dispose = await apply(ctx)

    expect(name).toBe('client-ui-settings-connectors-invariant')
    expect(inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@unieai/uad-client-ui-settings-connectors', expect.any(Function))
    // The installer is a no-op; calling it must not reach for anything.
    const installed = (register.mock.calls[0] as unknown as [string, (c: Context) => void])[1]
    expect(() => { installed(ctx) }).not.toThrow()
    expect(typeof dispose).toBe('function')
  })
})
