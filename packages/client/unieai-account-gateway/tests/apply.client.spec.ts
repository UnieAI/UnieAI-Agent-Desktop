/**
 * The plugin body on a real cordis context: the gateway reaches the section
 * under the service name the account contract publishes, reads the host once
 * per document, follows the reader's language, and leaves nothing behind on
 * teardown (HMR safety).
 *
 * The startup answer this bench provides says `unavailable` throughout, which
 * is deliberately the case where this gateway does its own reading — the
 * build with no gate, or a host that did not answer in time. What it does
 * when a startup answer HAS been gathered is `bootstrap.client.spec.ts`.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import {
  ACCOUNT_GATEWAY_SERVICE, type UnieAiAccountGateway, type UnieAiAccountState,
} from '@deepseek-ai/dsh-client-ui-unieai-account/client'
import type { UnieAiBootstrap } from '@deepseek-ai/dsh-client-unieai-bootstrap/client'
import * as GatewayInvariant from '@deepseek-ai/dsh-client-unieai-account-gateway/invariant'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'

const SNAPSHOT = {
  user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
  plan: { key: 'pro', name: 'Pro' },
  usage: { agentTurns: { used: 3, limit: 50, resetAt: '' } },
}

/** Stand in for the browser: one host answer, plus the two navigation verbs. */
function browser(answer: unknown) {
  const paths: string[] = []
  const assign = vi.fn()
  const reload = vi.fn()
  vi.stubGlobal('fetch', (path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, json: () => Promise.resolve(answer) } as Response)
  })
  vi.stubGlobal('location', { assign, reload })
  return { paths, assign, reload }
}

/** A startup answer that never gathered anything: the fallback path. */
const NO_STARTUP_ANSWER: UnieAiBootstrap = {
  getSnapshot: () => ({ status: 'unavailable', parts: {} }),
  subscribe: () => () => {},
  refresh: () => Promise.resolve(),
}

async function bench() {
  const ctx = new Context()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('unieaiBootstrap', NO_STARTUP_ANSWER)
  return { ctx, locale }
}

function gatewayOf(ctx: Context): UnieAiAccountGateway {
  const gateway = ctx.get(ACCOUNT_GATEWAY_SERVICE)
  if (gateway === undefined) throw new Error('no gateway is provided')
  return gateway
}

afterEach(() => { vi.unstubAllGlobals() })

describe('unieai-account-gateway browser apply', () => {
  it('declares the service its published text depends on, and the one that orders it', () => {
    expect(inject).toEqual(['locale', 'unieaiBootstrap'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the invariant companion under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(GatewayInvariant).await()).resolves.toBeDefined()
  })

  it('provides the gateway under the name the account contract publishes', async () => {
    browser({ status: 'signed-out' })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const gateway = gatewayOf(b.ctx)
    expect(typeof gateway.getSnapshot).toBe('function')
    expect(typeof gateway.subscribe).toBe('function')
    expect(typeof gateway.signIn).toBe('function')
    expect(typeof gateway.signOut).toBe('function')
  })

  it('reads the gate account route once and publishes what it says', async () => {
    const web = browser({ status: 'signed-in', snapshot: SNAPSHOT })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const gateway = gatewayOf(b.ctx)

    await vi.waitFor(() => { expect(gateway.getSnapshot().status).toBe('signed-in') })
    expect(web.paths).toEqual(['/auth/account'])
    const state: UnieAiAccountState = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.identity.email).toBe('ada@unieai.com')
  })

  it('relabels the standing account when the reader switches language', async () => {
    const web = browser({ status: 'signed-in', snapshot: SNAPSHOT })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const gateway = gatewayOf(b.ctx)
    await vi.waitFor(() => { expect(gateway.getSnapshot().status).toBe('signed-in') })

    b.locale.setLocale('zh-CN')
    const state: UnieAiAccountState = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.usage[0]?.label).toBe('智能体轮次')
    // Relabelling reads no route: the figures did not change, only the words.
    expect(web.paths).toEqual(['/auth/account'])
  })

  it('sends both gestures to the gate rather than handling them in the app', async () => {
    const web = browser({ status: 'signed-out' })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const gateway = gatewayOf(b.ctx)

    gateway.signIn()
    expect(web.assign).toHaveBeenCalledWith('/auth/login')

    gateway.signOut()
    await vi.waitFor(() => { expect(web.reload).toHaveBeenCalledTimes(1) })
    expect(web.paths).toEqual(['/auth/account', '/auth/logout'])
  })

  it('withdraws the service on teardown', async () => {
    browser({ status: 'signed-out' })
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(gatewayOf(b.ctx).getSnapshot()).toEqual({ status: 'signed-out' })

    await fiber.dispose()
    expect(b.ctx.get(ACCOUNT_GATEWAY_SERVICE)).toBeUndefined()
  })
})
