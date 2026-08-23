/**
 * The gateway over a driven host: what each answer publishes, that the two
 * gestures leave the app rather than pretending to work inside it, and the
 * reference-stability contract the section's render machinery depends on — a
 * reading that repeats the previous one must not hand out a new object.
 */
import { describe, expect, it, vi } from 'vitest'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import { AccountGateway, type AccountGatewayEnvironment } from '../src/client/gateway.ts'
import { COPY } from '../src/client/locales.ts'

const account = {
  user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
  plan: { key: 'pro', name: 'Pro' },
  usage: { agentTurns: { used: 3, limit: 50, resetAt: '' } },
}

/** A host whose answers the test sets, and which records every request. */
function host(answer: unknown, options: { ok?: boolean; throws?: boolean } = {}) {
  const calls: { path: string; init?: RequestInit }[] = []
  let body: unknown = answer
  const environment: AccountGatewayEnvironment = {
    request: (path, init) => {
      calls.push({ path, ...(init === undefined ? {} : { init }) })
      if (options.throws === true) return Promise.reject(new Error('offline'))
      return Promise.resolve({
        ok: options.ok ?? true,
        json: () => body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body),
      } as Response)
    },
    navigate: vi.fn(),
    reload: vi.fn(),
  }
  return { environment, calls, answerWith: (next: unknown) => { body = next } }
}

const gatewayOn = (bench: ReturnType<typeof host>, locale: LocaleId = 'en'): AccountGateway =>
  new AccountGateway(bench.environment, locale)

describe('AccountGateway before the first read', () => {
  it('opens signed-out and reaches no route on construction', () => {
    const bench = host({ status: 'signed-out' })
    const gateway = gatewayOn(bench)
    expect(gateway.getSnapshot()).toEqual({ status: 'signed-out' })
    expect(bench.calls).toEqual([])
  })
})

describe('AccountGateway reading /auth/account', () => {
  it('publishes the mapped account of a signed-in answer', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)
    await gateway.refresh()

    expect(bench.calls.map(call => call.path)).toEqual(['/auth/account'])
    expect(gateway.getSnapshot()).toEqual({
      status: 'signed-in',
      account: {
        identity: { displayName: 'Ada', email: 'ada@unieai.com' },
        plan: { label: 'Pro' },
        usage: [{ id: 'agent-turns', label: 'Agent turns', used: 3, limit: 50 }],
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stays signed-out without notifying when the host holds no session', async () => {
    const bench = host({ status: 'signed-out' })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)
    await gateway.refresh()
    expect(gateway.getSnapshot()).toEqual({ status: 'signed-out' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('reports the product failure the host passed on, in the reader language', async () => {
    const bench = host({ status: 'failed', message: 'The UnieAI account could not be read.' })
    const gateway = gatewayOn(bench, 'zh-CN')
    await gateway.refresh()
    expect(gateway.getSnapshot()).toEqual({
      status: 'failed',
      message: COPY['zh-CN'].productUnavailable,
    })
  })

  it('reports an unreachable host for a refused request, a bad status, or an unreadable body', async () => {
    const offline = gatewayOn(host(undefined, { throws: true }))
    await offline.refresh()
    expect(offline.getSnapshot()).toEqual({ status: 'failed', message: COPY['en'].hostUnreachable })

    const refused = gatewayOn(host({ status: 'signed-out' }, { ok: false }))
    await refused.refresh()
    expect(refused.getSnapshot()).toEqual({ status: 'failed', message: COPY['en'].hostUnreachable })

    const garbled = gatewayOn(host(undefined))
    await garbled.refresh()
    expect(garbled.getSnapshot()).toEqual({ status: 'failed', message: COPY['en'].hostUnreachable })

    const foreign = gatewayOn(host({ status: 'pending' }))
    await foreign.refresh()
    expect(foreign.getSnapshot()).toEqual({ status: 'failed', message: COPY['en'].hostUnreachable })
  })
})

describe('AccountGateway snapshot identity', () => {
  it('answers repeated reads with one object', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    await gateway.refresh()
    const first = gateway.getSnapshot()
    expect(gateway.getSnapshot()).toBe(first)
    expect(gateway.getSnapshot()).toBe(first)
  })

  it('keeps the same object when a second read repeats the first', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)
    await gateway.refresh()
    const first = gateway.getSnapshot()

    await gateway.refresh()
    expect(gateway.getSnapshot()).toBe(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('hands out a new object, and notifies, once a figure actually moves', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)
    await gateway.refresh()
    const first = gateway.getSnapshot()

    bench.answerWith({
      status: 'signed-in',
      snapshot: { ...account, usage: { agentTurns: { used: 4, limit: 50, resetAt: '' } } },
    })
    await gateway.refresh()
    expect(gateway.getSnapshot()).not.toBe(first)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('releases a subscriber that unsubscribes', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)()
    await gateway.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('AccountGateway following the reader language', () => {
  it('relabels the standing account without reading the host again', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    await gateway.refresh()
    const listener = vi.fn()
    gateway.subscribe(listener)

    gateway.setLocale('ja')
    expect(bench.calls).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(1)
    const state = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.usage[0]?.label)
      .toBe(COPY['ja'].meters.agentTurns)
  })

  it('ignores a switch to the locale already active', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    await gateway.refresh()
    const before = gateway.getSnapshot()
    gateway.setLocale('en')
    expect(gateway.getSnapshot()).toBe(before)
  })

  it('relabels a failure raised before any account was read', () => {
    const gateway = gatewayOn(host({ status: 'signed-out' }))
    gateway.setLocale('zh-TW')
    expect(gateway.getSnapshot()).toEqual({ status: 'signed-out' })
  })
})

describe('AccountGateway gestures', () => {
  it('leaves for the gate sign-in page instead of pretending to sign in here', () => {
    const bench = host({ status: 'signed-out' })
    const gateway = gatewayOn(bench)
    gateway.signIn()
    expect(bench.environment.navigate).toHaveBeenCalledWith('/auth/login')
    expect(bench.calls).toEqual([])
  })

  it('posts the logout and reloads the document', async () => {
    const bench = host({ status: 'signed-out' })
    const gateway = gatewayOn(bench)
    gateway.signOut()
    await vi.waitFor(() => { expect(bench.environment.reload).toHaveBeenCalledTimes(1) })
    expect(bench.calls).toEqual([{ path: '/auth/logout', init: { method: 'POST' } }])
  })

  it('reloads even when the logout request never lands', async () => {
    const bench = host(undefined, { throws: true })
    const gateway = gatewayOn(bench)
    gateway.signOut()
    await vi.waitFor(() => { expect(bench.environment.reload).toHaveBeenCalledTimes(1) })
  })
})

describe('AccountGateway teardown', () => {
  it('publishes nothing once disposed, including from a read still in flight', async () => {
    const bench = host({ status: 'signed-in', snapshot: account })
    const gateway = gatewayOn(bench)
    const listener = vi.fn()
    gateway.subscribe(listener)
    const inFlight = gateway.refresh()
    gateway.dispose()
    await inFlight

    expect(gateway.getSnapshot()).toEqual({ status: 'signed-out' })
    expect(listener).not.toHaveBeenCalled()
  })
})
