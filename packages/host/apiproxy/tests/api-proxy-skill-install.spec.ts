/**
 * What `skill.install` puts on disk, and what it refuses to put there.
 *
 * This operation writes a file into the directory the harness discovers user
 * skills from, and a skill is instructions a model will follow — so where the
 * bytes come from is the contract. They come from the account, fetched here
 * through `ctx.unieaiGate`; the request carries a slug and nothing else, and a
 * page therefore cannot choose what a skill says.
 *
 * The refusals each lead to a different sentence on the surface, which is why
 * they are separate codes rather than one failure.
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { Context } from '@unieai/cordis'
import AgentRegistry from '@unieai/uad-agent'
import SessionStore from '@unieai/uad-session'
import Storage from '@unieai/uad-storage'
import { DomainFacility } from '@unieai/uad-storage-domain'
import UserQuestionService from '@unieai/uad-user-questions'
import type { RpcRequest, RpcResponse } from '@unieai/uad-host-apiproxy/api/rpc'
import { RpcId } from '@unieai/uad-host-apiproxy/api/rpc'
import { createApiProxy } from '@unieai/uad-host-apiproxy'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1
const request = <P>(payload: P): RpcRequest<P> =>
  ({ rpcId: RpcId(`install-${String(nextRpc++)}`), payload })

const expectErr = <T>(response: RpcResponse<T>): { code: string; message: string } => {
  expect(response.result.ok).toBe(false)
  if (response.result.ok) throw new Error('unreachable')
  return response.result.error
}

const expectOk = <T>(response: RpcResponse<T>): T => {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

const DOCUMENT = '---\nname: "Weekly Report"\ndescription: "Writes the Monday summary."\n---\n\nBody.\n'

const home = process.env['DSH_HOME']

afterEach(() => {
  if (home === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = home
})

/**
 * Compose the API over a throwaway harness home and one gate answer.
 * @param answer - what `ctx.unieaiGate.accountSkill` returns; the literal
 * `'absent'` stands for a deployment that composes no gate at all.
 * @returns the API plus the home its writes land in.
 */
async function harness(answer: unknown) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-skill-install-')))
  // The handler resolves the harness home itself, the way discovery does.
  process.env['DSH_HOME'] = root
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  const asked: string[] = []
  if (answer !== 'absent') {
    ctx.provide('unieaiGate', {
      productUrl: 'https://product.test',
      session: () => undefined,
      mcpServers: () => Promise.resolve(undefined),
      entitledModels: () => Promise.resolve(undefined),
      accountSkill: (slug: string) => {
        asked.push(slug)
        return Promise.resolve(answer)
      },
    } as never)
  }
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
  })
  return { api, root, asked }
}

const signal = () => new AbortController().signal

describe('copying a skill from the account', () => {
  it('writes the account document where discovery looks for user skills', async () => {
    const { api, root, asked } = await harness({ slug: 'weekly-report', name: 'Weekly Report', content: DOCUMENT })
    const wrote = expectOk(await api.skills.install(request({ slug: 'weekly-report' }), signal()))

    expect(wrote.path).toBe(join(root, 'skills', 'weekly-report', 'SKILL.md'))
    expect(readFileSync(wrote.path, 'utf8')).toBe(DOCUMENT)
    expect(wrote.name).toBe('Weekly Report')
    expect(wrote.replaced).toBe(false)
    // The slug is all the caller sent; the bytes were fetched here.
    expect(asked).toEqual(['weekly-report'])
  })

  it('says when it replaced a file, because that file may be one someone edited', async () => {
    const { api, root } = await harness({ slug: 'weekly-report', name: 'Weekly Report', content: DOCUMENT })
    mkdirSync(join(root, 'skills', 'weekly-report'), { recursive: true })
    writeFileSync(join(root, 'skills', 'weekly-report', 'SKILL.md'), 'mine\n')

    const wrote = expectOk(await api.skills.install(request({ slug: 'weekly-report' }), signal()))
    expect(wrote.replaced).toBe(true)
    expect(readFileSync(wrote.path, 'utf8')).toBe(DOCUMENT)
  })

  it('reports a build with no account gate as a source problem, not a failure', async () => {
    const { api } = await harness('absent')
    const error = expectErr(await api.skills.install(request({ slug: 'weekly-report' }), signal()))
    expect(error.code).toBe('skill-source-unavailable')
  })

  it('reports a signed-out gate the same way, because a retry cannot help either', async () => {
    const { api } = await harness(undefined)
    const error = expectErr(await api.skills.install(request({ slug: 'weekly-report' }), signal()))
    expect(error.code).toBe('skill-source-unavailable')
  })

  it('keeps a skill the account no longer has apart from a read that failed', async () => {
    const gone = await harness('not-found')
    expect(expectErr(await gone.api.skills.install(request({ slug: 'weekly-report' }), signal())).code)
      .toBe('skill-not-on-account')

    const broken = await harness('unreadable')
    expect(expectErr(await broken.api.skills.install(request({ slug: 'weekly-report' }), signal())).code)
      .toBe('skill-unreadable')
  })

  it('writes nothing at all when the document could not be read', async () => {
    const { api, root } = await harness('unreadable')
    await api.skills.install(request({ slug: 'weekly-report' }), signal())
    expect(() => readFileSync(join(root, 'skills', 'weekly-report', 'SKILL.md'), 'utf8')).toThrow()
  })
})
