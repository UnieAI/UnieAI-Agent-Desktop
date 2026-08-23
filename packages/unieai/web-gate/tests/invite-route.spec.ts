/**
 * `POST /auth/invite`, and the invite rows the account snapshot carries.
 *
 * Two things are pinned. A refusal travels as the PRODUCT's own identifier,
 * never as its prose — the same discipline `/auth/providers` already follows,
 * because only the browser knows the reader's language. And the rows on
 * `/auth/account` are built by name: `inviteUrl` is forwarded because a
 * redemption link is what the person is meant to pass on, while anything else
 * the product might attach has nowhere to land.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY, call, gate, product, request, signIn } from './gate-bench.ts'
import type { Answer } from './gate-bench.ts'

const ROW = {
  inviteeEmail: 'friend@example.com',
  status: 'pending',
  createdAt: '2026-08-20T09:00:00.000Z',
  inviteUrl: 'https://product.test/invite/ref/abc123',
}

const ME: Answer = { body: { user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' } } }

/** The product answers every call the account snapshot makes. */
const baseline = (overrides: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/desktop/me': ME,
  'GET /api/desktop/usage': { body: { plan: { key: 'pro', name: 'Pro' }, usage: {} } },
  'GET /api/desktop/invite': { body: { referrals: [ROW], availableCredits: 2 } },
  'GET /api/desktop/profile': { body: { name: 'Ada', email: 'ada@unieai.com' } },
  'GET /api/desktop/stats': { body: { daily: [] } },
  'POST /api/desktop/invite': { body: { ok: true, inviteUrl: ROW.inviteUrl } },
  ...overrides,
})

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

/**
 * Bring up a gate whose product answers the given overrides, and sign in.
 * @param overrides - answers by `"<METHOD> <path>"`.
 * @returns the session cookie.
 */
async function withProduct(overrides: Record<string, Answer>): Promise<{ cookie: string }> {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
  web = product(baseline(overrides))
  bench = gate()
  await bench.fiber.await()
  return { cookie: await signIn(bench.server) }
}

const send = async (cookie: string, body: unknown) =>
  call(bench.server.handler('/auth/invite'), request({ cookie }, body, 'POST'))

beforeEach(async () => {
  web = product(baseline())
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('POST /auth/invite', () => {
  it('answers signed-out to a browser with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/invite'), request({}, { email: 'x@y.z' }, 'POST'))

    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('reports the link the product created', async () => {
    const cookie = await signIn(bench.server)
    const res = await send(cookie, { email: 'friend@example.com' })

    expect(res.json()).toEqual({ status: 'sent', url: ROW.inviteUrl })
  })

  it('spends the session key on the product instead of disclosing it', async () => {
    const cookie = await signIn(bench.server)
    const res = await send(cookie, { email: 'friend@example.com' })

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('forwards the product\'s refusal identifier verbatim', async () => {
    for (const reason of ['invalid_email', 'self_invite', 'already_invited']) {
      const { cookie } = await withProduct({
        'POST /api/desktop/invite': { status: reason === 'already_invited' ? 409 : 400, body: { error: reason } },
      })
      const res = await send(cookie, { email: 'friend@example.com' })

      // The identifier this build has never heard of would travel too: the
      // page renders one line per reason and can only do that if the host
      // stops interpreting them.
      expect(res.json()).toEqual({ status: 'refused', reason })
    }
  })

  it('refuses a body naming no address, without calling the product', async () => {
    const cookie = await signIn(bench.server)
    const before = web.sent.length
    const res = await send(cookie, { email: '   ' })

    expect(res.status).toBe(400)
    // The product's own identifier for the same condition, so the page has one
    // line for it whichever side noticed.
    expect(res.json()).toEqual({ status: 'refused', reason: 'invalid_email' })
    expect(web.sent.length).toBe(before)
  })

  it('reports a failure when the product answers a 2xx it cannot read', async () => {
    const { cookie } = await withProduct({ 'POST /api/desktop/invite': { body: { surprise: true } } })
    const res = await send(cookie, { email: 'friend@example.com' })

    // The invite may well exist, so this is not a refusal to retry blindly.
    expect(res.json()).toEqual({ status: 'failed' })
  })

  it('names a refusal even when the product sends no identifier', async () => {
    const { cookie } = await withProduct({ 'POST /api/desktop/invite': { status: 400, body: {} } })
    const res = await send(cookie, { email: 'friend@example.com' })

    expect(res.json()).toEqual({ status: 'refused', reason: 'invite_refused' })
  })
})

describe('the invite rows on GET /auth/account', () => {
  /**
   * Read the account snapshot for a signed-in browser.
   * @param cookie - the session cookie.
   * @returns the snapshot member of the answer.
   */
  const snapshot = async (cookie: string): Promise<Record<string, unknown>> => {
    const res = await call(bench.server.handler('/auth/account'), request({ cookie }))
    const body = res.json() as { status: string; snapshot: Record<string, unknown> }
    expect(body.status).toBe('signed-in')
    return body.snapshot
  }

  it('carries the rows, not only their count', async () => {
    const cookie = await signIn(bench.server)
    const read = await snapshot(cookie)

    expect(read['invites']).toEqual([ROW])
    expect(read['inviteCount']).toBe(1)
    expect(read['inviteCredits']).toBe(2)
  })

  it('drops whatever else the product attaches to a row', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/invite': {
        body: {
          referrals: [{ ...ROW, inviteCode: 'raw-code-secret', inviterId: 'u_1' }],
          availableCredits: 2,
        },
      },
    })
    const res = await call(bench.server.handler('/auth/account'), request({ cookie }))

    // Built by name, so a column added on the product has nowhere to land.
    expect(res.body).not.toContain('raw-code-secret')
    expect((res.json() as { snapshot: { invites: unknown } }).snapshot.invites).toEqual([ROW])
  })

  it('drops a row that names nobody', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/invite': { body: { referrals: [{ status: 'pending' }, ROW], availableCredits: 0 } },
    })

    expect((await snapshot(cookie))['invites']).toEqual([ROW])
  })

  it('leaves the rows absent when the referral call failed', async () => {
    const { cookie } = await withProduct({ 'GET /api/desktop/invite': { status: 502, body: {} } })
    const read = await snapshot(cookie)

    // Absent, not empty: an account that has invited nobody and a call that
    // did not happen must not render the same.
    expect(read).not.toHaveProperty('invites')
    expect(read).not.toHaveProperty('inviteCount')
  })
})
