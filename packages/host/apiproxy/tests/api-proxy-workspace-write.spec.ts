/**
 * What `host.writeWorkspaceFile` will change on disk, and what it refuses.
 *
 * The refusals are the point twice over. This operation accepts content from a
 * browser and puts it on the host's filesystem, so its fence — a registered
 * workspace root, a path inside it, a file that already exists, a size the
 * deployment bounds, and the version the reader was handed — is the whole
 * contract, and an untested fence is not a fence.
 */

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { FsError } from '@unieai/uad-fs'
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
  ({ rpcId: RpcId(`write-${String(nextRpc++)}`), payload })

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

/**
 * A filesystem over the real directory whose version is the file's mtime, and
 * whose write honours the `replaceIfVersion` guard — the two behaviours this
 * operation leans on.
 */
const realFs = () => ({
  resolve: (path: string) => Promise.resolve({ targetKey: realpathSync(path), displayPath: realpathSync(path) }),
  // The workspace registry canonicalizes through this seam, so the
  // stand-in has to answer the identity questions too, not only the
  // reads and writes the proxy itself makes.
  processPath: (target: { displayPath: string }) => target.displayPath,
  stat: (target: { displayPath: string }) => {
    try {
      const info = statSync(target.displayPath)
      return Promise.resolve({
        type: info.isDirectory() ? 'directory' : 'file',
        size: info.size,
        version: String(info.mtimeMs),
      })
    } catch { return Promise.resolve(undefined) }
  },
  readText: (target: { displayPath: string }) =>
    Promise.resolve(readFileSync(target.displayPath, 'utf8')),
  writeText: (target: { displayPath: string }, content: string, expected?: { kind: string; version: string }) => {
    if (expected?.kind === 'replaceIfVersion') {
      const now = String(statSync(target.displayPath).mtimeMs)
      if (now !== expected.version) throw new FsError('file changed since it was read', 'FS_STALE_VERSION')
    }
    writeFileSync(target.displayPath, content, 'utf8')
    return Promise.resolve({
      operation: 'update' as const,
      version: String(statSync(target.displayPath).mtimeMs),
      before: null,
    })
  },
})

/** Compose the API over real Session/Agent/Storage/Workspace plus the fs above. */
async function harness(options: { maxBytes?: number } = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-write-')))
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
  ctx.provide('directoryPicker', { capability: () => ({ kind: 'native', pick: async () => null }) } as never)
  ctx.provide('fs', realFs() as never)
  // Mounted after the filesystem: the registry canonicalizes through that
  // seam, so it cannot start before one is available.
  await ctx.plugin(WorkspaceRegistry)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd: root,
    ...(options.maxBytes === undefined ? {} : { workspaceFileMaxBytes: options.maxBytes }),
  })
  return { api, ctx, root }
}

const adopt = async (ctx: Context, dir: string): Promise<void> => {
  await ctx.workspaceRegistry.create(dir)
}

const signal = () => new AbortController().signal

describe('writing inside a workspace', () => {
  it('replaces a file the reader was handed, and reports the next version', async () => {
    const { api, ctx, root } = await harness()
    const path = join(root, 'a.txt')
    writeFileSync(path, 'before\n')
    await adopt(ctx, root)
    const read = expectOk(await api.host.readWorkspaceFile(request({ root, path }), signal()))
    expect(read.version).toBeDefined()
    const wrote = expectOk(await api.host.writeWorkspaceFile(
      request({ root, path, text: 'after\n', version: read.version! }), signal()))
    expect(readFileSync(path, 'utf8')).toBe('after\n')
    expect(wrote.version).not.toBe(read.version)
  })

  it('refuses a root the registry does not hold', async () => {
    const { api, root } = await harness()
    const path = join(root, 'a.txt')
    writeFileSync(path, 'x')
    // Never adopted: an unregistered root is a directory the page chose.
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path, text: 'y', version: '1' }), signal()))
    expect(error.code).toBe('workspace-invalid-path')
  })

  it('refuses a path that escapes its root', async () => {
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path: join(root, '..', 'outside.txt'), text: 'y', version: '1' }), signal()))
    expect(error.code).toBe('workspace-invalid-path')
  })

  it('creates nothing: an absent path is refused rather than brought into existence', async () => {
    // A viewer that could create files would be a way to place content
    // anywhere the host account can write, and creating is not editing.
    const { api, ctx, root } = await harness()
    await adopt(ctx, root)
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path: join(root, 'new.txt'), text: 'y', version: '1' }), signal()))
    expect(error.code).toBe('directory-unreadable')
  })

  it('refuses a directory', async () => {
    const { api, ctx, root } = await harness()
    mkdirSync(join(root, 'sub'))
    await adopt(ctx, root)
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path: join(root, 'sub'), text: 'y', version: '1' }), signal()))
    expect(error.code).toBe('directory-unreadable')
  })

  it('bounds what an editor can save, as the read bounds what it can show', async () => {
    const { api, ctx, root } = await harness({ maxBytes: 8 })
    const path = join(root, 'a.txt')
    writeFileSync(path, 'x')
    await adopt(ctx, root)
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path, text: 'far too much content', version: '1' }), signal()))
    expect(error.code).toBe('workspace-invalid-path')
    expect(readFileSync(path, 'utf8')).toBe('x')
  })

  it('refuses a save over a file that moved on, and leaves that work alone', async () => {
    // The case this guard exists for: an agent edits the same file while an
    // editor sits open. Without it, the save discards the agent's work and
    // nobody learns it happened.
    const { api, ctx, root } = await harness()
    const path = join(root, 'a.txt')
    writeFileSync(path, 'before\n')
    await adopt(ctx, root)
    const read = expectOk(await api.host.readWorkspaceFile(request({ root, path }), signal()))
    writeFileSync(path, 'the agent wrote this\n')
    const error = expectErr(await api.host.writeWorkspaceFile(
      request({ root, path, text: 'the editor wrote this\n', version: read.version! }), signal()))
    expect(error.code).toBe('workspace-file-stale')
    expect(readFileSync(path, 'utf8')).toBe('the agent wrote this\n')
  })
})
