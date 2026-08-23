/**
 * `/auth/bootstrap` end to end through the gate's own session table.
 *
 * The route is the desktop's startup answer, so the cases that matter are the
 * ones a person actually meets: signed out (which must cost nothing), signed
 * in right after the device grant (which must already be gathered), a product
 * that will not answer, and a session that lapsed while the app was open.
 *
 * The credential assertions are here for the same reason as on every other
 * `/auth/*` suite: this answer carries four product reads at once, so it is
 * the largest surface on which the desktop API key could escape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY, PRODUCT, call, gate, product, request, signIn } from './gate-bench.ts'
import type { Answer } from './gate-bench.ts'

const ME = { body: { user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' } } }
const USAGE = { body: { plan: { key: 'pro', name: 'Pro' }, usage: {} } }
const PROVIDERS = { body: { providers: [{ id: 'p_1', name: 'OpenAI', prefix: 'oai' }] } }
const MODELS = { body: { models: [{ value: 'oai-gpt', label: 'gpt' }] } }
const MCP = { body: { servers: [{ id: 's_1', label: 'Studio', url: `${PRODUCT}/mcp`, token: 'mcp-bearer' }] } }

/** A product that answers every read the startup gather makes. */
const complete: Record<string, Answer> = {
  'GET /api/desktop/me': ME,
  'GET /api/desktop/usage': USAGE,
  'GET /api/desktop/providers': PROVIDERS,
  'GET /api/desktop/models': MODELS,
  'GET /api/desktop/mcp': MCP,
}

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

/**
 * Bring up a gate whose product answers the given table.
 * @param answers - answers by `"<METHOD> <path>"`.
 * @param config - gate config overrides.
 * @returns nothing; {@link bench} and {@link web} are replaced.
 */
async function withProduct(
  answers: Record<string, Answer>,
  config: Parameters<typeof gate>[0] = {},
): Promise<void> {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
  web = product(answers)
  bench = gate(config)
  await bench.fiber.await()
}

/**
 * Read the startup route.
 * @param cookie - the session cookie, when one is presented.
 * @returns the captured response.
 */
const startup = async (cookie?: string) =>
  call(bench.server.handler('/auth/bootstrap'), request(cookie === undefined ? {} : { cookie }))

beforeEach(async () => {
  web = product(complete)
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('GET /auth/bootstrap', () => {
  it('answers signed-out without calling the product at all', async () => {
    const before = web.sent.length
    const res = await startup()

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out', parts: {}, pending: [] })
    expect(web.sent.length).toBe(before)
  })

  it('answers a signed-in desktop with every part in one body', async () => {
    const cookie = await signIn(bench.server)
    const res = await startup(cookie)
    const body = res.json() as { status: string; parts: Record<string, unknown>; pending: string[] }

    expect(body.status).toBe('ready')
    expect(body.pending).toEqual([])
    expect(Object.keys(body.parts).sort()).toEqual(['account', 'mcp', 'models', 'providers'])
    expect(body.parts['providers']).toEqual({
      status: 'signed-in',
      providers: [expect.objectContaining({ id: 'p_1', prefix: 'oai' })],
    })
    expect(body.parts['models']).toEqual({ status: 'signed-in', models: [expect.objectContaining({ value: 'oai-gpt' })] })
  })

  it('has already gathered when the sign-in landed, so the startup read makes no new product call', async () => {
    const cookie = await signIn(bench.server)
    await vi.waitUntil(() => web.sent.some(sent => sent.url.endsWith('/api/desktop/mcp')))
    const before = web.sent.length

    const res = await startup(cookie)

    expect((res.json() as { status: string }).status).toBe('ready')
    expect(web.sent.length).toBe(before)
  })

  it('carries neither the desktop API key nor a server bearer to the browser', async () => {
    const cookie = await signIn(bench.server)
    const res = await startup(cookie)

    expect(res.body).not.toContain(API_KEY)
    expect(res.body).not.toContain('mcp-bearer')
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
  })

  it('answers with each part\'s own failure body when the product will not answer', async () => {
    await withProduct({})
    const cookie = await signIn(bench.server)
    const res = await startup(cookie)
    const body = res.json() as { status: string; parts: Record<string, { status: string }> }

    // Every part settled — as a failure. A gathered failure and a part that
    // never landed are different facts, and only the second is `pending`.
    expect(body.status).toBe('ready')
    expect(body.parts['account']).toEqual({ status: 'failed', message: 'The UnieAI account could not be read.' })
    expect(body.parts['providers']?.status).toBe('failed')
    expect(body.parts['models']?.status).toBe('failed')
    expect(body.parts['mcp']?.status).toBe('failed')
  })

  it('answers within its own deadline when the product never replies, naming what it is still waiting for', async () => {
    await withProduct({
      ...complete,
      // One read that never settles: the socket the desktop must not wait on.
      'GET /api/desktop/mcp': { body: new Promise(() => {}) },
    })
    const cookie = await signIn(bench.server)

    const started = Date.now()
    const res = await startup(cookie)
    const body = res.json() as { status: string; pending: string[] }

    expect(body.status).toBe('partial')
    expect(body.pending).toEqual(['mcp'])
    expect(Date.now() - started).toBeLessThan(4000)
  }, 10_000)

  it('answers signed-out once the session has lapsed, without touching what it gathered', async () => {
    await withProduct(complete, { idleTimeoutMs: 0 })
    const cookie = await signIn(bench.server)
    // The lapse is evaluated on read, so the clock has to have moved at all.
    await new Promise((resolve) => { setTimeout(resolve, 5) })
    const before = web.sent.length

    const res = await startup(cookie)

    expect(res.json()).toEqual({ status: 'signed-out', parts: {}, pending: [] })
    expect(web.sent.length).toBe(before)
  })

  it('stops answering from the account it gathered for once that account signs out', async () => {
    const cookie = await signIn(bench.server)
    await startup(cookie)
    await call(bench.server.handler('/auth/logout'), request({ cookie }, undefined, 'POST'))
    const before = web.sent.length

    const next = await signIn(bench.server)
    const res = await startup(next)

    // A gather ran again for the new session — one device poll plus the parts
    // — rather than the dropped account's copy being handed to it.
    expect((res.json() as { status: string }).status).toBe('ready')
    expect(web.sent.length).toBeGreaterThan(before + 1)
  })
})
