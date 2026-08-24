/**
 * What `host.listWorkspaceEntries` will publish to a page, and what it refuses.
 *
 * The refusals are the point. This operation sends file NAMES to a browser, so
 * its fence — a registered workspace root, and a path that resolves inside it —
 * is the whole security contract, and an untested fence is not a fence.
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import AgentRegistry from '@unieai/uad-agent'
import SessionStore from '@unieai/uad-session'
import Storage from '@unieai/uad-storage'
import { DomainFacility } from '@unieai/uad-storage-domain'
import UserQuestionService from '@unieai/uad-user-questions'
import WorkspaceRegistry from '@unieai/uad-workspace'
import type { RpcRequest, RpcResponse } from '@unieai/uad-host-apiproxy/api/rpc'
import { RpcId } from '@unieai/uad-host-apiproxy/api/rpc'
import { createApiProxy } from '@unieai/uad-host-apiproxy'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

let nextRpc = 1
const request = <P>(payload: P): RpcRequest<P> =>
  ({ rpcId: RpcId(`listing-${String(nextRpc++)}`), payload })

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

/** A filesystem service over the real directory: lists, stats, and reads text. */
const realFs = () => ({
  resolve: (path: string) => Promise.resolve({ targetKey: path, displayPath: path }),
  stat: (target: { displayPath: string }) => {
    try {
      const info = statSync(target.displayPath)
      return Promise.resolve({ type: info.isDirectory() ? 'directory' : 'file', size: info.size })
    } catch { return Promise.resolve(undefined) }
  },
  readText: (target: { displayPath: string }) =>
    Promise.resolve(readFileSync(target.displayPath, 'utf8')),
  listDir: (target: { displayPath: string }) => {
    return Promise.resolve(readdirSync(target.displayPath, { withFileTypes: true }).map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' as const : entry.isFile() ? 'file' as const : 'other' as const,
      target: { targetKey: join(target.displayPath, entry.name), displayPath: join(target.displayPath, entry.name) },
    })))
  },
})

/** Compose the API over real Session/Agent/Storage/Workspace plus an fs stand-in. */
async function harness(options: { fs?: unknown; maxEntries?: number; maxBytes?: number } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-listing-')))
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
  await ctx.plugin(WorkspaceRegistry)
  ctx.provide('directoryPicker', { capability: () => ({ kind: 'native', pick: async () => null }) } as never)
  const fs = 'fs' in options ? options.fs : realFs()
  if (fs !== undefined) ctx.provide('fs', fs as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
    ...(options.maxEntries === undefined ? {} : { workspaceListingMaxEntries: options.maxEntries }),
    ...(options.maxBytes === undefined ? {} : { workspaceFileMaxBytes: options.maxBytes }),
  })
  return { api, ctx, root }
}

/** Register `dir` as a workspace so the fence admits it. */
const adopt = async (ctx: Context, dir: string): Promise<void> => {
  await ctx.workspaceRegistry.create(dir)
}

describe('listing inside a workspace', () => {
  it('reports directories before files, each group name-sorted', async () => {
    const { api, ctx, root } = await harness()
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'b.ts'), '')
    writeFileSync(join(root, 'a.ts'), '')
    await adopt(ctx, root)
    const value = expectOk(await api.host.listWorkspaceEntries(request({ root }), new AbortController().signal))
    expect(value.entries.map(entry => entry.name)).toEqual(['docs', 'src', 'a.ts', 'b.ts'])
    expect(value.entries.map(entry => entry.kind)).toEqual(['directory', 'directory', 'file', 'file'])
    expect(value.root).toBe(root)
  })

  it('lists a level below the root', async () => {
    const { api, ctx, root } = await harness()
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'deep.ts'), '')
    await adopt(ctx, root)
    const value = expectOk(await api.host.listWorkspaceEntries(
      request({ root, path: join(root, 'src') }), new AbortController().signal))
    expect(value.entries.map(entry => entry.name)).toEqual(['deep.ts'])
    expect(value.path).toBe(join(root, 'src'))
  })

  it('says so when it cut the level rather than implying it was complete', async () => {
    const { api, ctx, root } = await harness({ maxEntries: 2 })
    for (const name of ['a', 'b', 'c']) writeFileSync(join(root, name), '')
    await adopt(ctx, root)
    const value = expectOk(await api.host.listWorkspaceEntries(request({ root }), new AbortController().signal))
    expect(value.entries).toHaveLength(2)
    expect(value.truncated).toBe(true)
  })
})

describe('what the fence refuses', () => {
  it('refuses a root the workspace registry does not hold', async () => {
    // The page does not get to name a root. If it could, the operation would
    // list any directory the host account can read.
    const { api, root } = await harness()
    expect(expectErr(await api.host.listWorkspaceEntries(
      request({ root }), new AbortController().signal)).code).toBe('workspace-invalid-path')
  })

  it('refuses a path that escapes upward', async () => {
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    expect(expectErr(await api.host.listWorkspaceEntries(
      request({ root, path: join(root, '..') }), new AbortController().signal)).code).toBe('workspace-invalid-path')
  })

  it('refuses a sibling whose name merely starts with the root name', async () => {
    // The trap a string-prefix containment test falls into: `/w/project-secrets`
    // starts with `/w/project` and is not inside it.
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    expect(expectErr(await api.host.listWorkspaceEntries(
      request({ root, path: `${root}-secrets` }), new AbortController().signal)).code)
      .toBe('workspace-invalid-path')
  })

  it('reports an unreadable level rather than an empty one', async () => {
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    expect(expectErr(await api.host.listWorkspaceEntries(
      request({ root, path: join(root, 'missing') }), new AbortController().signal)).code)
      .toBe('directory-unreadable')
  })

  it('says the deployment composes no filesystem instead of answering empty', async () => {
    // An always-empty listing reads as "this workspace has no files", which is
    // a different and wrong fact.
    const { api, ctx, root } = await harness({ fs: undefined })
    await adopt(ctx, root)
    expect(expectErr(await api.host.listWorkspaceEntries(
      request({ root }), new AbortController().signal)).code).toBe('workspace-listing-unavailable')
  })
})

describe('reading one file inside a workspace', () => {
  it('returns the text', async () => {
    const { api, ctx, root } = await harness()
    writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
    await adopt(ctx, root)
    const value = expectOk(await api.host.readWorkspaceFile(
      request({ root, path: join(root, 'a.ts') }), new AbortController().signal))
    expect(value.text).toBe('export const a = 1\n')
    expect(value.reason).toBeUndefined()
  })

  it('withholds a file past the deployment bound and says why', async () => {
    // A viewer is not a transfer mechanism; the bound keeps the bytes off the
    // wire rather than hanging a browser tab.
    const { api, ctx, root } = await harness({ maxBytes: 8 })
    writeFileSync(join(root, 'big.txt'), 'x'.repeat(64))
    await adopt(ctx, root)
    const value = expectOk(await api.host.readWorkspaceFile(
      request({ root, path: join(root, 'big.txt') }), new AbortController().signal))
    expect(value.text).toBeUndefined()
    expect(value.reason).toBe('too-large')
    expect(value.size).toBe(64)
  })

  it('withholds binary content rather than rendering replacement characters', async () => {
    const { api, ctx, root } = await harness()
    writeFileSync(join(root, 'bin'), Buffer.from([0x89, 0x50, 0x00, 0x0d]))
    await adopt(ctx, root)
    const value = expectOk(await api.host.readWorkspaceFile(
      request({ root, path: join(root, 'bin') }), new AbortController().signal))
    expect(value.reason).toBe('binary')
    expect(value.text).toBeUndefined()
  })

  it('refuses a path outside the workspace, and a root nobody registered', async () => {
    // The same fence as the listing, asserted separately: a reader that
    // inherited the fence by convention would lose it on the first refactor.
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    expect(expectErr(await api.host.readWorkspaceFile(
      request({ root, path: join(root, '..', 'escape.txt') }), new AbortController().signal)).code)
      .toBe('workspace-invalid-path')
    const other = await harness()
    expect(expectErr(await other.api.host.readWorkspaceFile(
      request({ root: other.root, path: join(other.root, 'a.ts') }), new AbortController().signal)).code)
      .toBe('workspace-invalid-path')
  })

  it('refuses a directory, which is not a file to show', async () => {
    const { api, ctx, root } = await harness()
    mkdirSync(join(root, 'src'))
    await adopt(ctx, root)
    expect(expectErr(await api.host.readWorkspaceFile(
      request({ root, path: join(root, 'src') }), new AbortController().signal)).code)
      .toBe('directory-unreadable')
  })
})
