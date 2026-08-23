/**
 * The gateway's first account, taken from the desktop's startup answer.
 *
 * What this suite is really asserting is that the account arrives WITHOUT this
 * package reading the host: the startup answer was gathered before the
 * document mounted anything, and a gateway that read `/auth/account` anyway
 * would have made the gathering pointless. The cases below are the four ways
 * a desktop actually starts — signed in, signed out, product unreachable, and
 * a startup answer that could not be had at all — plus what happens when the
 * account changes afterwards, which must still go to the host.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {
  UnieAiBootstrap, UnieAiBootstrapSnapshot,
} from '@deepseek-ai/dsh-client-unieai-bootstrap/client'
import {
  ACCOUNT_GATEWAY_SERVICE, type UnieAiAccountGateway,
} from '@deepseek-ai/dsh-client-ui-unieai-account/client'
import { apply, inject } from '../src/client/index.ts'
import { AccountGateway } from '../src/client/gateway.ts'

const SNAPSHOT = {
  user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
  plan: { key: 'pro', name: 'Pro' },
  usage: { agentTurns: { used: 3, limit: 50, resetAt: '' } },
}

/** The account part as `/auth/account` spells it. */
const ACCOUNT_PART = { status: 'signed-in', snapshot: SNAPSHOT }

/** One startup answer a test can move. */
function startup(initial: UnieAiBootstrapSnapshot) {
  const listeners = new Set<() => void>()
  let snapshot = initial
  const service: UnieAiBootstrap = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    refresh: () => Promise.resolve(),
  }
  return {
    service,
    move: (next: UnieAiBootstrapSnapshot) => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Stand in for the browser; every host read is recorded. */
function browser(answers: Record<string, unknown>) {
  const paths: string[] = []
  const table = answers
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    paths.push(path)
    const key = `${init?.method ?? 'GET'} ${path}`
    const answer = key in table ? table[key] : answers
    return Promise.resolve({ ok: true, json: () => Promise.resolve(answer) } as Response)
  })
  vi.stubGlobal('location', { assign: vi.fn(), reload: vi.fn() })
  return { paths }
}

/**
 * Mount the gateway over one startup answer.
 * @param answer - the startup snapshot the desktop begins with.
 * @returns the context and the mounted gateway.
 */
async function bench(answer: UnieAiBootstrapSnapshot) {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const source = startup(answer)
  ctx.provide('unieaiBootstrap', source.service)
  await ctx.plugin({ inject: [...inject], apply }).await()
  const gateway: UnieAiAccountGateway | undefined = ctx.get(ACCOUNT_GATEWAY_SERVICE)
  if (gateway === undefined) throw new Error('no gateway is provided')
  return { ctx, gateway, source }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('unieai-account-gateway over the startup answer', () => {
  it('waits for the startup answer, because nothing else orders activation', () => {
    expect(inject).toEqual(['locale', 'unieaiBootstrap'])
  })

  it('publishes the gathered account without reading the host', async () => {
    const web = browser({ status: 'signed-out' })
    const { gateway } = await bench({ status: 'ready', parts: { account: ACCOUNT_PART } })

    expect(web.paths).toEqual([])
    const state = gateway.getSnapshot()
    expect(state.status).toBe('signed-in')
    expect(state.status === 'signed-in' && state.account.identity.email).toBe('ada@unieai.com')
  })

  it('publishes signed-out without reading the host, which is what makes it fast', async () => {
    const web = browser({ status: 'signed-out' })
    const { gateway } = await bench({ status: 'signed-out', parts: {} })

    expect(web.paths).toEqual([])
    expect(gateway.getSnapshot().status).toBe('signed-out')
  })

  it('publishes the product failure the host gathered, rather than a host failure', async () => {
    browser({ status: 'signed-out' })
    const { gateway } = await bench({
      status: 'ready',
      parts: { account: { status: 'failed', message: 'The UnieAI account could not be read.' } },
    })

    const state = gateway.getSnapshot()
    expect(state.status).toBe('failed')
    // The product's failure, in the reader's language rather than the host's.
    expect(state.status === 'failed' && state.message.length > 0).toBe(true)
  })

  it('reads the host itself when there was no startup answer to be had', async () => {
    const web = browser({ status: 'signed-in', snapshot: SNAPSHOT })
    const { gateway } = await bench({ status: 'unavailable', parts: {} })
    await vi.waitUntil(() => gateway.getSnapshot().status === 'signed-in')

    expect(web.paths).toEqual(['/auth/account'])
  })

  it('reads the host itself when the account part did not land', async () => {
    const web = browser({ status: 'signed-in', snapshot: SNAPSHOT })
    const { gateway } = await bench({ status: 'partial', parts: { providers: { status: 'signed-in', providers: [] } } })
    await vi.waitUntil(() => gateway.getSnapshot().status === 'signed-in')

    expect(web.paths).toEqual(['/auth/account'])
  })

  it('adopts the account a follow-up gather delivered', async () => {
    const web = browser({ status: 'signed-out' })
    const { gateway, source } = await bench({
      status: 'partial',
      parts: { account: { status: 'signed-in', snapshot: SNAPSHOT } },
    })

    source.move({
      status: 'ready',
      parts: {
        account: {
          status: 'signed-in',
          snapshot: { ...SNAPSHOT, user: { ...SNAPSHOT.user, name: 'Ada Lovelace' } },
        },
      },
    })

    // The gather completed behind the first answer and this gateway followed
    // it — a warm start, not a snapshot frozen at boot.
    const state = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.identity.displayName).toBe('Ada Lovelace')
    expect(web.paths).toEqual([])
  })

  it('keeps refreshing itself from the host, so a save is not undone by a stale gather', async () => {
    const stored = { ...SNAPSHOT, user: { ...SNAPSHOT.user, name: 'Ada Lovelace' } }
    browser({
      'POST /auth/profile': { status: 'saved', profile: { name: 'Ada Lovelace' } },
      'GET /auth/account': { status: 'signed-in', snapshot: stored },
    })
    const { gateway, source } = await bench({ status: 'ready', parts: { account: ACCOUNT_PART } })

    await gateway.saveProfile({ displayName: 'Ada Lovelace' })
    const saved = gateway.getSnapshot()
    source.move({ status: 'ready', parts: { account: ACCOUNT_PART } })

    expect(saved.status === 'signed-in' && saved.account.identity.displayName).toBe('Ada Lovelace')
    // The startup answer is the start of the document, not the current state:
    // once this gateway has read the host, a later gather cannot roll it back.
    const now = gateway.getSnapshot()
    expect(now.status === 'signed-in' && now.account.identity.displayName).toBe('Ada Lovelace')
  })

  it('still reaches a section that looked for it before the startup answer arrived', async () => {
    // What `ui-unieai-account` does: read the service while its own body runs
    // and adopt a later one through `internal/service`. Waiting for the
    // startup answer makes that late path the ordinary one, so the event has
    // to fire — a section that never hears it renders "not connected" forever.
    browser({})
    const ctx = new Context()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const seen: string[] = []
    ctx.on('internal/service', (name: string) => { seen.push(name) })

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(ctx.get(ACCOUNT_GATEWAY_SERVICE)).toBeUndefined()

    ctx.provide('unieaiBootstrap', startup({ status: 'signed-out', parts: {} }).service)
    await fiber.await()

    expect(seen).toContain(ACCOUNT_GATEWAY_SERVICE)
    expect(ctx.get(ACCOUNT_GATEWAY_SERVICE)).toBeDefined()
  })

  it('follows one startup answer once, however many times it is offered', () => {
    let subscriptions = 0
    const source: UnieAiBootstrap = {
      getSnapshot: () => ({ status: 'signed-out', parts: {} }),
      subscribe: () => { subscriptions += 1; return () => {} },
      refresh: () => Promise.resolve(),
    }
    const gateway = new AccountGateway({
      request: () => Promise.reject(new Error('no host in this test')),
      navigate: () => {},
      reload: () => {},
    }, 'en')

    gateway.followBootstrap(source)
    gateway.followBootstrap(source)

    // A service event can fire more than once; stacking subscriptions on it
    // would leave a disposed gateway still being told about the account.
    expect(subscriptions).toBe(1)
    gateway.dispose()
  })

  it('leaves nothing subscribed to the startup answer on teardown', async () => {
    browser({ status: 'signed-out' })
    const ctx = new Context()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const source = startup({ status: 'ready', parts: { account: ACCOUNT_PART } })
    ctx.provide('unieaiBootstrap', source.service)
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()

    await fiber.dispose()
    source.move({ status: 'signed-out', parts: {} })

    expect(ctx.get(ACCOUNT_GATEWAY_SERVICE)).toBeUndefined()
  })
})
