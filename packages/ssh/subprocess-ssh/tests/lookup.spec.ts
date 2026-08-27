/**
 * What the provider refuses before it opens a connection.
 *
 * These refusals are the local provider's rules restated for a machine that
 * is not this one: a path with no resolution base cannot acquire one by
 * crossing the network.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshSubprocessRuntime } from '../src/index.ts'

function runtime(): SshSubprocessRuntime {
  return new SshSubprocessRuntime(new Context(), { machine: 'build' })
}

describe('resolving an executable', () => {
  it('refuses a relative path, whose base is undefined on either machine', async () => {
    await expect(runtime().resolveExecutable('./tools/build')).rejects.toThrow(/no resolution base/)
    await expect(runtime().resolveExecutable('tools/build')).rejects.toThrow(/no resolution base/)
  })

  it('refuses an empty name instead of asking the machine about nothing', async () => {
    await expect(runtime().resolveExecutable('')).rejects.toThrow(/cannot be empty/)
  })
})
