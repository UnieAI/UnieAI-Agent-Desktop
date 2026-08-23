/**
 * `/auth/account` end to end through the gate's own session table.
 *
 * The route exists for one reason: the API key that authenticates the
 * product's `/api/desktop/*` surface lives in that table and must never reach
 * a page. The suite therefore signs a browser in the way the device flow does,
 * reads the account back, and checks the whole serialized answer for the key —
 * not just the fields it expects to find.
 */
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@unieai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebRoute } from '@unieai/uad-host-webserver'
import { apply, Config } from '../src/index.ts'

/** What a route table stores against one path. */
type WebRouteHandler = WebRoute['handler']

const PRODUCT = 'https://product.test'
const API_KEY = 'sk-desktop-super-secret'

/**
 * One captured route table, standing in for the WebServer service.
 *
 * Exact and prefix rows are kept apart and resolved the way the real service
 * resolves them — exact first, then longest matching prefix — because the gate
 * registers both kinds at `/auth/providers`, and a table keyed by path alone
 * would let one silently replace the other.
 */
function webServer() {
  const routes = new Map<string, WebRouteHandler>()
  return {
    service: {
      register: (route: { kind?: string; path: string; handler: WebRouteHandler }) => {
        const key = `${route.kind ?? 'exact'} ${route.path}`
        routes.set(key, route.handler)
        return () => { routes.delete(key) }
      },
      registerGuard: () => () => {},
    },
    handler: (path: string): WebRouteHandler => {
      const exact = routes.get(`exact ${path}`)
      if (exact !== undefined) return exact
      let best: { prefix: string; handler: WebRouteHandler } | undefined
      for (const [key, handler] of routes) {
        if (!key.startsWith('prefix ')) continue
        const prefix = key.slice('prefix '.length)
        if (path !== prefix && !path.startsWith(`${prefix}/`)) continue
        if (best === undefined || prefix.length > best.prefix.length) best = { prefix, handler }
      }
      if (best === undefined) throw new Error(`no route registered at ${path}`)
      return best.handler
    },
  }
}

/** A response that records what a handler wrote instead of sending it. */
class CapturedResponse {
  status = 0
  readonly headers: Record<string, string> = {}
  body = ''

  writeHead(status: number, headers?: Record<string, string | number>): this {
    this.status = status
    for (const [name, value] of Object.entries(headers ?? {})) this.headers[name] = String(value)
    return this
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  end(payload?: string | Buffer): void {
    if (payload !== undefined) this.body = payload.toString()
  }

  json(): unknown {
    return JSON.parse(this.body) as unknown
  }
}

function request(headers: Record<string, string>, body?: unknown): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return Object.assign(Readable.from(payload), { headers }) as unknown as IncomingMessage
}

const call = async (handler: WebRouteHandler, req: IncomingMessage): Promise<CapturedResponse> => {
  const res = new CapturedResponse()
  await handler(req, res as unknown as ServerResponse)
  return res
}

/** The product, answering the device grant and the three desktop reads. */
function product(overrides: Record<string, unknown> = {}) {
  const authorizations: (string | undefined)[] = []
  const answers: Record<string, unknown> = {
    [`${PRODUCT}/api/desktop/device/poll`]: {
      status: 'approved',
      api_key: API_KEY,
      user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
    },
    [`${PRODUCT}/api/desktop/me`]: { user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' } },
    [`${PRODUCT}/api/desktop/usage`]: {
      plan: { key: 'pro', name: 'Pro' },
      usage: { agentTurns: { used: 3, limit: 50, resetAt: '2026-08-23T00:00:00.000Z', windowHours: 5 } },
    },
    [`${PRODUCT}/api/desktop/invite`]: { referrals: [], availableCredits: 0 },
    ...overrides,
  }
  vi.stubGlobal('fetch', (url: string, init?: { headers?: Record<string, string> }) => {
    authorizations.push(init?.headers?.['authorization'])
    const answer = answers[url]
    if (answer === undefined) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer) })
  })
  return { authorizations }
}

function gate() {
  const server = webServer()
  const ctx = new Context()
  ctx.provide('webServer', server.service)
  const fiber = ctx.plugin({ inject: ['webServer'], apply, Config }, {
    productUrl: PRODUCT,
    enforce: true,
    // Spelled out rather than relying on the schema's defaults: this is the
    // security gate, and a test of it should state the posture it is testing
    // instead of inheriting one that could change underneath it.
    allowedUserIds: [],
    claimFirstLogin: true,
    idleTimeoutMs: 12 * 60 * 60 * 1000,
    allowDirectRequests: true,
  })
  return { server, fiber }
}

/** Sign one browser in through the device poll, and return its cookie header. */
async function signIn(server: ReturnType<typeof webServer>): Promise<string> {
  const res = await call(server.handler('/auth/device/poll'), request({}, { deviceCode: 'dc_1' }))
  expect(res.json()).toEqual({ status: 'approved' })
  const cookie = res.headers['set-cookie']?.split(';')[0]
  if (cookie === undefined) throw new Error('the poll set no session cookie')
  return cookie
}

let bench: ReturnType<typeof gate>

beforeEach(async () => {
  product()
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('/auth/account', () => {
  it('answers signed-out to a browser with no session', async () => {
    const res = await call(bench.server.handler('/auth/account'), request({}))
    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
  })

  it('answers with the account the product reported', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/account'), request({ cookie }))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({
      status: 'signed-in',
      snapshot: {
        user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
        plan: { key: 'pro', name: 'Pro' },
        usage: {
          agentTurns: { used: 3, limit: 50, resetAt: '2026-08-23T00:00:00.000Z', windowHours: 5 },
        },
        inviteCredits: 0,
        inviteCount: 0,
        // The rows themselves, not only their count: the account section lists
        // who was invited, and an empty list is an account that invited nobody
        // rather than a referral call that failed.
        invites: [],
      },
    })
  })

  it('carries the stored avatar into the account, so both surfaces show one photo', async () => {
    product({
      [`${PRODUCT}/api/desktop/profile`]: {
        name: 'Ada', email: 'ada@unieai.com', image: 'data:image/png;base64,AAA',
      },
    })
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    const res = await call(fresh.server.handler('/auth/account'), request({ cookie }))
    await fresh.fiber.dispose()

    expect(res.json()).toMatchObject({
      snapshot: { user: { avatarUrl: 'data:image/png;base64,AAA' } },
    })
  })

  it('never writes the session API key into the answer', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/account'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
  })

  it('spends the key on the product instead, as a bearer', async () => {
    const web = product()
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    await call(fresh.server.handler('/auth/account'), request({ cookie }))
    await fresh.fiber.dispose()

    expect(web.authorizations).toContain(`Bearer ${API_KEY}`)
  })

  it('reports a failure, not an empty account, when the product will not answer', async () => {
    product({ [`${PRODUCT}/api/desktop/me`]: undefined })
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    const res = await call(fresh.server.handler('/auth/account'), request({ cookie }))
    await fresh.fiber.dispose()

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI account could not be read.' })
  })
})
