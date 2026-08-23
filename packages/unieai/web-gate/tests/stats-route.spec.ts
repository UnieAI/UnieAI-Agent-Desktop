/**
 * `/auth/stats` and the activity section of `/auth/account`.
 *
 * The two are one record read once, so the suite covers them together. What it
 * pins is the rule the rest of the account snapshot already follows: a
 * statistics read that did not happen leaves its section ABSENT. Zeroes are a
 * claim about an account, and an unanswered product is not one — an Overview
 * strip that draws em-dashes for the first case and `0` for the second is
 * telling the truth in both, and it can only do that if the two arrive
 * differently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY, call, gate, product, request, signIn } from './gate-bench.ts'
import type { Answer } from './gate-bench.ts'

const STATS = {
  totalTokens: 1_234_567,
  peakDayTokens: 98_765,
  longestTaskMinutes: 42,
  currentStreakDays: 3,
  longestStreakDays: 19,
  daily: [
    { date: '2026-08-20', tokens: 1000 },
    { date: '2026-08-21', tokens: 2000 },
  ],
}

const ME: Answer = { body: { user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' } } }

/** The product answers every call the account snapshot makes. */
const baseline = (stats: Answer): Record<string, Answer> => ({
  'GET /api/desktop/me': ME,
  'GET /api/desktop/usage': { body: { plan: { key: 'pro', name: 'Pro' }, usage: {} } },
  'GET /api/desktop/invite': { body: { referrals: [], availableCredits: 0 } },
  'GET /api/desktop/profile': { body: { profile: { name: 'Ada', email: 'ada@unieai.com' } } },
  'GET /api/desktop/stats': stats,
})

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

/**
 * Bring up a gate whose `/api/desktop/stats` answers as given, and sign in.
 * @param stats - the statistics answer to stub.
 * @returns the session cookie.
 */
async function withStats(stats: Answer): Promise<{ cookie: string }> {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
  web = product(baseline(stats))
  bench = gate()
  await bench.fiber.await()
  return { cookie: await signIn(bench.server) }
}

beforeEach(async () => {
  web = product(baseline({ body: STATS }))
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('GET /auth/stats', () => {
  it('answers signed-out to a browser with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/stats'), request({}))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('answers with the figures the product reported', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-in', stats: STATS })
  })

  it('spends the session key on the product instead of disclosing it', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('reads a sparse body into zeroes, since the product listed the day at all', async () => {
    const { cookie } = await withStats({ body: { daily: [{ date: '2026-08-20' }] } })
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.json()).toEqual({
      status: 'signed-in',
      stats: {
        totalTokens: 0,
        peakDayTokens: 0,
        longestTaskMinutes: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        daily: [{ date: '2026-08-20', tokens: 0 }],
      },
    })
  })

  it('drops a day it cannot place on a calendar', async () => {
    const { cookie } = await withStats({ body: { ...STATS, daily: [{ tokens: 5 }, ...STATS.daily] } })
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', stats: STATS })
  })

  it('reports a failure, not zeroes, when the product will not answer', async () => {
    const { cookie } = await withStats({ status: 502, body: { error: 'stats_unavailable' } })
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.json()).toEqual({
      status: 'failed',
      message: 'The UnieAI activity statistics could not be read.',
    })
  })

  it('reports a failure when the product answers a body with no series at all', async () => {
    const { cookie } = await withStats({ body: { totalTokens: 5 } })
    const res = await call(bench.server.handler('/auth/stats'), request({ cookie }))

    expect(res.json()).toEqual({
      status: 'failed',
      message: 'The UnieAI activity statistics could not be read.',
    })
  })
})

describe('the activity section of GET /auth/account', () => {
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

  it('carries the five figures and the series the Overview strip draws', async () => {
    const cookie = await signIn(bench.server)

    expect((await snapshot(cookie))['stats']).toEqual(STATS)
  })

  it('leaves the section absent when the statistics read failed', async () => {
    const { cookie } = await withStats({ status: 502, body: {} })
    const read = await snapshot(cookie)

    // Absent, not zeroed, and not null: the account itself still read fine, so
    // the answer is a snapshot with one section missing.
    expect(read).not.toHaveProperty('stats')
    expect(read['user']).toEqual({ id: 'u_1', name: 'Ada', email: 'ada@unieai.com' })
  })
})
