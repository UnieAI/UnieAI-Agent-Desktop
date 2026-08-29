// A routed subprocess provider is CONSTRUCTED, not mounted, so its declared
// injection never runs. The world it is built on then refuses an undeclared
// read — and because every command goes through here once a remote machine is
// picked, that refusal reaches a person as `echo hi` failing with
// `cannot get property "ssh" without inject`.

import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '@unieai/uad-ssh'
import { buildSubprocess } from '../src/providers.ts'

/**
 * A context shaped like the real composition.
 *
 * The distinction is load-bearing and is why this bug survived an e2e suite: a
 * service CONSTRUCTED against a bare context becomes a direct property, and the
 * context proxy answers it without consulting injection at all. Mounted as a
 * plugin it lives in a fiber, and an undeclared read from an isolated world is
 * then refused — which is what a shipped composition does.
 * @param withBook - whether a machine book is mounted.
 * @returns the context.
 */
async function composed(withBook: boolean): Promise<Context> {
  const ctx = new Context()
  if (withBook) await ctx.plugin(SshHosts, {})
  return ctx
}

describe('building a machine’s subprocess provider', () => {
  it('names the missing machine book, rather than failing as an injection error', async () => {
    const ctx = await composed(false)
    expect(() => buildSubprocess(ctx, 'build-box')).toThrow(/mounts no machine book/u)
  })

  it('builds this computer without a machine book at all, because none is involved', async () => {
    const ctx = await composed(false)
    expect(() => buildSubprocess(ctx, 'local')).not.toThrow()
  })
})
