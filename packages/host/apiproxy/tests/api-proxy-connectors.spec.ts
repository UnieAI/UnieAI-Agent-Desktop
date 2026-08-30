/**
 * The connector RPC domain over createApiProxy: a deployment with no
 * connectors answers rather than breaks, the view never carries a token, the
 * approval page reaches a browser on this computer, and a host with no
 * desktop refuses before anyone waits on a redirect that cannot arrive.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@unieai/cordis'
import AgentRegistry from '@unieai/uad-agent'
import SessionStore from '@unieai/uad-session'
import SystemPrompt from '@unieai/uad-system-prompt'
import ToolRuntime from '@unieai/uad-tools'
import UserQuestionService from '@unieai/uad-user-questions'
import LlmRuntime from '@unieai/uad-llm'
import type { ConnectorStatus } from '@unieai/uad-connector'
import type { ConnectorView } from '../src/api/index.ts'
import type { RpcRequest, RpcResponse } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

const DEFAULTS = { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`req-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

function expectErr<T>(response: RpcResponse<T>): { code: string; message: string } {
  expect(response.result.ok).toBe(false)
  if (response.result.ok) throw new Error('unreachable')
  return response.result.error
}

/** One connector's state as the seam reports it. */
function status(id: string, over: Partial<ConnectorStatus> = {}): ConnectorStatus {
  return { id, label: id, connected: false, scopes: [], renewable: false, requiresClientId: false, ...over }
}

/**
 * A connectors service this suite drives by hand.
 * @param ctx - the context the approval URL is emitted on.
 * @param connect - what one connect attempt does.
 */
function fakeConnectors(ctx: Context, connect?: (id: string, signal: AbortSignal) => Promise<ConnectorStatus>) {
  const forgotten: string[] = []
  let stored = [status('notion'), status('google', { requiresClientId: true })]
  return {
    forgotten,
    service: {
      list: () => Promise.resolve(stored),
      connect: connect ?? ((id: string) => {
        ctx.emit('connectors/authorize', id, `https://provider.example/authorize?for=${id}`)
        return Promise.resolve(status(id, {
          connected: true,
          account: 'someone@example.com',
          scopes: ['read'],
          expiresAt: '2026-09-30T00:00:00.000Z',
          renewable: true,
        }))
      }),
      disconnect: (id: string) => {
        forgotten.push(id)
        stored = stored.filter(entry => entry.id !== id)
        return Promise.resolve()
      },
    },
  }
}

const signal = () => new AbortController().signal

/**
 * The smallest context createApiProxy will construct on. Nothing here is a
 * connector fact; the gateway simply binds every domain at construction.
 * @returns the composed context.
 */
async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  ctx.provide('workspaceRegistry', { list: () => [] } as never)
  return ctx
}

describe('connector RPC domain', () => {
  it('lists nothing, and forgets nothing, in a deployment that composes no connectors', async () => {
    const api = createApiProxy(await harness(), DEFAULTS)

    expect(expectOk(await api.host.listConnectors(request({}), signal()))).toEqual({ connectors: [] })
    expect(expectOk(await api.host.disconnectConnector(request({ connector: 'notion' }), signal())))
      .toEqual({ connectors: [] })
    expect(expectErr(await api.host.connectConnector(request({ connector: 'notion' }), signal())).code)
      .toBe('connectors-unavailable')
  })

  it('carries names and state across the wire, and never a token', async () => {
    const ctx = await harness()
    ctx.provide('connectors', fakeConnectors(ctx).service as never)
    const api = createApiProxy(ctx, { ...DEFAULTS, canOpenPath: () => true, openUrl: () => Promise.resolve() })

    const { connectors } = expectOk(await api.host.listConnectors(request({}), signal()))
    expect(connectors).toEqual([
      { id: 'notion', label: 'notion', connected: false, scopes: [], renewable: false, requiresClientId: false },
      { id: 'google', label: 'google', connected: false, scopes: [], renewable: false, requiresClientId: true },
    ])

    const view = expectOk(await api.host.connectConnector(request({ connector: 'notion' }), signal()))
    expect(view).toEqual({
      id: 'notion',
      label: 'notion',
      connected: true,
      account: 'someone@example.com',
      scopes: ['read'],
      expiresAt: '2026-09-30T00:00:00.000Z',
      renewable: true,
      requiresClientId: false,
    } satisfies ConnectorView)
    expect(JSON.stringify(view)).not.toContain('token')
  })

  it('opens the approval page for the connector being connected, and no other', async () => {
    const ctx = await harness()
    // A second connector's authorization, emitted WHILE this attempt runs — a
    // parallel attempt on another connection — is not this attempt's page and
    // must not take the browser this person is waiting at.
    ctx.provide('connectors', fakeConnectors(ctx, (id) => {
      ctx.emit('connectors/authorize', 'linear', 'https://provider.example/authorize?for=linear')
      ctx.emit('connectors/authorize', id, `https://provider.example/authorize?for=${id}`)
      return Promise.resolve(status(id, { connected: true }))
    }).service as never)
    const openUrl = vi.fn(() => Promise.resolve())
    const api = createApiProxy(ctx, { ...DEFAULTS, canOpenPath: () => true, openUrl })

    await api.host.connectConnector(request({ connector: 'notion' }), signal())

    expect(openUrl.mock.calls.map(call => (call as unknown as [string])[0]))
      .toEqual(['https://provider.example/authorize?for=notion'])
  })

  it('ends the attempt when the browser will not open, and reports why', async () => {
    const ctx = await harness()
    ctx.provide('connectors', fakeConnectors(ctx, (id, attemptSignal) => new Promise((_resolve, reject) => {
      ctx.emit('connectors/authorize', id, 'https://provider.example/authorize')
      attemptSignal.addEventListener('abort', () => { reject(new Error('aborted')) })
    })).service as never)
    const api = createApiProxy(ctx, {
      ...DEFAULTS,
      canOpenPath: () => true,
      openUrl: () => Promise.reject(new Error('xdg-open is not available')),
    })

    expect(expectErr(await api.host.connectConnector(request({ connector: 'notion' }), signal())))
      .toEqual({ code: 'connector-refused', message: 'xdg-open is not available', details: {} })
  })

  it('abandons the attempt when the caller stops waiting', async () => {
    const ctx = await harness()
    ctx.provide('connectors', fakeConnectors(ctx, (_id, attemptSignal) => new Promise((_resolve, reject) => {
      attemptSignal.addEventListener('abort', () => { reject(new Error('the person cancelled')) })
    })).service as never)
    const api = createApiProxy(ctx, { ...DEFAULTS, canOpenPath: () => true, openUrl: () => Promise.resolve() })

    const caller = new AbortController()
    const running = api.host.connectConnector(request({ connector: 'notion' }), caller.signal)
    caller.abort()

    expect(expectErr(await running).message).toBe('the person cancelled')
  })

  it('reports the seam’s own refusal, which is what names the missing client id', async () => {
    const ctx = await harness()
    ctx.provide('connectors', fakeConnectors(ctx, () =>
      Promise.reject(new Error('no OAuth client id is configured for google'))).service as never)
    const api = createApiProxy(ctx, { ...DEFAULTS, canOpenPath: () => true, openUrl: () => Promise.resolve() })

    expect(expectErr(await api.host.connectConnector(request({ connector: 'google' }), signal())).message)
      .toBe('no OAuth client id is configured for google')
  })

  it('refuses before waiting when this host has no desktop to open a browser on', async () => {
    const ctx = await harness()
    const connectors = fakeConnectors(ctx)
    ctx.provide('connectors', connectors.service as never)
    const api = createApiProxy(ctx, { ...DEFAULTS, canOpenPath: () => false })

    const error = expectErr(await api.host.connectConnector(request({ connector: 'notion' }), signal()))
    expect(error.code).toBe('connector-refused')
    expect(error.message).toContain('computer running Rabi')
  })

  it('forgets one grant and answers with the list as it now stands', async () => {
    const ctx = await harness()
    const connectors = fakeConnectors(ctx)
    ctx.provide('connectors', connectors.service as never)
    const api = createApiProxy(ctx, DEFAULTS)

    const { connectors: left } = expectOk(await api.host.disconnectConnector(request({ connector: 'notion' }), signal()))
    expect(connectors.forgotten).toEqual(['notion'])
    expect(left.map(entry => entry.id)).toEqual(['google'])
  })
})
