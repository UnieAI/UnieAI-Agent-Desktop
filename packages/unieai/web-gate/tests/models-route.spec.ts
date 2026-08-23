/**
 * `/auth/models` end to end through the gate's own session table.
 *
 * The route exists to keep two things true, and both are asserted against the
 * whole serialized answer rather than against the fields the suite expects:
 * the desktop API key never reaches a page, and the product's model list
 * arrives without a credential or an endpoint attached to any entry. The
 * second is what makes this list honest about what it is — a statement of
 * what the account may run ON THE PRODUCT, not a set of models this desktop
 * could dial.
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

const MODEL = {
  value: 'ACME-acme-large',
  label: 'acme-large',
  source: 'personal',
  prefix: 'ACME',
  providerName: 'Acme',
  groupName: '',
  acceptsImages: false,
  modelType: 'base_model',
  agentHarness: 'none',
}

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

function request(headers: Record<string, string>, body?: unknown, method = 'GET'): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return Object.assign(Readable.from(payload), { headers, method }) as unknown as IncomingMessage
}

const call = async (handler: WebRouteHandler, req: IncomingMessage): Promise<CapturedResponse> => {
  const res = new CapturedResponse()
  await handler(req, res as unknown as ServerResponse)
  return res
}

/** One recorded outbound call to the product. */
interface Sent { url: string; method: string; authorization: string | undefined }

/** The product, answering the device grant and the desktop model surface. */
function product(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  const sent: Sent[] = []
  const answers: Record<string, { status?: number; body: unknown }> = {
    'POST /api/desktop/device/poll': {
      body: {
        status: 'approved',
        api_key: API_KEY,
        user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
      },
    },
    'GET /api/desktop/models': { body: { models: [MODEL] } },
    ...overrides,
  }
  vi.stubGlobal('fetch', (url: string, init?: {
    method?: string
    headers?: Record<string, string>
  }) => {
    const method = init?.method ?? 'GET'
    sent.push({ url, method, authorization: init?.headers?.['authorization'] })
    const answer = answers[`${method} ${url.slice(PRODUCT.length)}`]
    if (answer === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    const status = answer.status ?? 200
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(answer.body) })
  })
  return { sent }
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
  const res = await call(server.handler('/auth/device/poll'), request({}, { deviceCode: 'dc_1' }, 'POST'))
  expect(res.json()).toEqual({ status: 'approved' })
  const cookie = res.headers['set-cookie']?.split(';')[0]
  if (cookie === undefined) throw new Error('the poll set no session cookie')
  return cookie
}

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

/** Bring up a gate whose product answers the given overrides, and sign in. */
async function withProduct(
  overrides: Record<string, { status?: number; body: unknown }>,
): Promise<{ cookie: string }> {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
  web = product(overrides)
  bench = gate()
  await bench.fiber.await()
  return { cookie: await signIn(bench.server) }
}

beforeEach(async () => {
  web = product()
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('GET /auth/models', () => {
  it('answers signed-out to a browser with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/models'), request({}))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('answers with the models the product reported', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-in', models: [MODEL] })
  })

  it('spends the session key on the product instead of disclosing it', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('carries no credential and no endpoint back, whatever the product sends', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': {
        body: {
          models: [{
            ...MODEL,
            // A future or misbehaving product build that attached these must
            // not be able to widen what this desktop holds: the reader builds
            // the entry field by field, so an unknown field has nowhere to go.
            apiKey: 'sk-provider-secret',
            apiUrl: 'https://gateway.acme.example/v1',
          }],
        },
      },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.body).not.toContain('sk-provider-secret')
    expect(res.body).not.toContain('gateway.acme.example')
    expect(res.json()).toEqual({ status: 'signed-in', models: [MODEL] })
  })

  it('drops an entry with no slug rather than showing a model it cannot name', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': { body: { models: [{ label: 'nameless' }, MODEL] } },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', models: [MODEL] })
  })

  it('de-duplicates on the slug, so one model cannot render twice', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': { body: { models: [MODEL, { ...MODEL, source: 'global' }] } },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', models: [MODEL] })
  })

  it('reads a sparse entry into defined absences rather than dropping it', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': { body: { models: [{ value: 'GLOB-g-1', source: 'global' }] } },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.json()).toEqual({
      status: 'signed-in',
      models: [{
        value: 'GLOB-g-1',
        // No label reported: the slug is a worse name than a real one and a
        // better one than a blank row.
        label: 'GLOB-g-1',
        source: 'global',
        prefix: '',
        providerName: '',
        groupName: '',
        acceptsImages: false,
        // The ordinary case, not the special one: a build that predates these
        // fields serves plain chat models, and guessing otherwise would label
        // the whole catalogue as needing a harness this desktop never runs.
        modelType: 'base_model',
        agentHarness: 'none',
      }],
    })
  })

  it('reports a failure, not an empty list, when the product will not answer', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': { status: 500, body: {} },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    // An account entitled to nothing and a product that could not be reached
    // are different facts, and a surface that has to choose what to say needs
    // to be able to tell them apart.
    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI models could not be read.' })
  })

  it('reports a failure when the product answers something it cannot read', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/models': { body: { models: 'not-a-list' } },
    })
    const res = await call(bench.server.handler('/auth/models'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI models could not be read.' })
  })
})
