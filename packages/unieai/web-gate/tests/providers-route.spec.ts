/**
 * `/auth/providers` end to end through the gate's own session table.
 *
 * Two things the route exists to keep true, and both are asserted against the
 * whole serialized answer rather than against the fields the suite expects:
 * the desktop API key never reaches a page, and no provider credential ever
 * travels back from the product to the browser. The create direction carries a
 * credential the other way, which is the one direction a secret may move.
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
const PROVIDER_KEY = 'sk-provider-typed-by-the-user'

const ROW = {
  id: 'p_1',
  displayName: 'Acme',
  prefix: 'ACME',
  apiUrl: 'https://gateway.acme.example/v1',
  enabled: true,
  managed: false,
  models: ['acme-large'],
  selectedModels: ['acme-large'],
  updatedAt: '2026-08-01T00:00:00.000Z',
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

function request(
  headers: Record<string, string>,
  body?: unknown,
  method = 'GET',
  url = '/auth/providers',
): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return Object.assign(Readable.from(payload), { headers, method, url }) as unknown as IncomingMessage
}

const call = async (handler: WebRouteHandler, req: IncomingMessage): Promise<CapturedResponse> => {
  const res = new CapturedResponse()
  await handler(req, res as unknown as ServerResponse)
  return res
}

/** One recorded outbound call to the product. */
interface Sent { url: string; method: string; authorization: string | undefined; body: unknown }

/** The product, answering the device grant and the desktop provider surface. */
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
    'GET /api/desktop/providers': { body: { providers: [ROW] } },
    'POST /api/desktop/providers': { body: { provider: ROW } },
    'PATCH /api/desktop/providers/p_1': { body: { provider: ROW } },
    'DELETE /api/desktop/providers/p_1': { status: 204, body: null },
    ...overrides,
  }
  vi.stubGlobal('fetch', (url: string, init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }) => {
    const method = init?.method ?? 'GET'
    sent.push({
      url,
      method,
      authorization: init?.headers?.['authorization'],
      body: init?.body === undefined ? undefined : JSON.parse(init.body) as unknown,
    })
    const answer = answers[`${method} ${url.slice(PRODUCT.length)}`]
    if (answer === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    const status = answer.status ?? 200
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(answer.body),
    })
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

describe('GET /auth/providers', () => {
  it('answers signed-out to a browser with no session', async () => {
    const res = await call(bench.server.handler('/auth/providers'), request({}))
    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
  })

  it('answers with the providers the product reported', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-in', providers: [ROW] })
  })

  it('spends the session key on the product instead of disclosing it', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('drops a row with no id rather than showing a provider it cannot address', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/providers': { body: { providers: [{ displayName: 'nameless' }, ROW] } },
    })
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', providers: [ROW] })
  })

  it('treats an unflagged row as managed, so it stays read-only here', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/providers': { body: { providers: [{ id: 'p_2' }] } },
    })
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))

    const body = res.json() as { providers: { managed: boolean }[] }
    expect(body.providers[0]?.managed).toBe(true)
  })

  it('reports a failure, not an empty list, when the product will not answer', async () => {
    const { cookie } = await withProduct({
      'GET /api/desktop/providers': { status: 500, body: {} },
    })
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI providers could not be read.' })
  })
})

describe('POST /auth/providers', () => {
  const draft = {
    displayName: 'Acme',
    prefix: 'ACME',
    apiUrl: 'https://gateway.acme.example/v1',
    apiKey: PROVIDER_KEY,
  }

  it('forwards the draft to the product and answers with the created row', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, draft, 'POST'),
    )

    expect(res.json()).toEqual({ status: 'created', provider: ROW })
    const create = web.sent.find(one => one.method === 'POST' && one.url.endsWith('/api/desktop/providers'))
    expect(create?.body).toEqual(draft)
    expect(create?.authorization).toBe(`Bearer ${API_KEY}`)
  })

  it('never writes the provider credential back to the page', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, draft, 'POST'),
    )

    expect(res.body).not.toContain(PROVIDER_KEY)
    expect(res.body).not.toContain(API_KEY)
  })

  it('refuses a body missing a required field before spending a request', async () => {
    const cookie = await signIn(bench.server)
    const before = web.sent.length
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, { prefix: 'ACME' }, 'POST'),
    )

    expect(res.status).toBe(400)
    expect(web.sent.length).toBe(before)
  })

  it("forwards the product's own refusal identifier rather than prose", async () => {
    const { cookie } = await withProduct({
      'POST /api/desktop/providers': { status: 409, body: { error: 'prefix_taken' } },
    })
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, draft, 'POST'),
    )

    expect(res.json()).toEqual({ status: 'refused', reason: 'prefix_taken' })
  })

  it('still reports a refusal when the product names no reason', async () => {
    const { cookie } = await withProduct({
      'POST /api/desktop/providers': { status: 400, body: {} },
    })
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, draft, 'POST'),
    )

    expect(res.json()).toEqual({ status: 'refused', reason: 'create_refused' })
  })

  it('reports a failure when the product answers something it cannot read', async () => {
    const { cookie } = await withProduct({
      'POST /api/desktop/providers': { body: { provider: null } },
    })
    const res = await call(
      bench.server.handler('/auth/providers'),
      request({ cookie }, draft, 'POST'),
    )

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI provider could not be created.' })
  })

  it('answers signed-out to a create with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/providers'), request({}, draft, 'POST'))

    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })
})

describe('PATCH and DELETE /auth/providers/<id>', () => {
  const row = (method: string, body?: unknown, id = 'p_1') =>
    (headers: Record<string, string>): IncomingMessage =>
      request(headers, body, method, `/auth/providers/${id}`)

  it('forwards the patch to the product and answers with the stored row', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { displayName: 'Renamed', enabled: false })({ cookie }),
    )

    expect(res.json()).toEqual({ status: 'updated', provider: ROW })
    const sent = web.sent.find(one => one.method === 'PATCH')
    // `enabled` is the read projection's spelling; the product's column is
    // `enable`, and this host is where the two are reconciled.
    expect(sent?.body).toEqual({ displayName: 'Renamed', enable: false })
    expect(sent?.authorization).toBe(`Bearer ${API_KEY}`)
  })

  it('omits a credential the browser did not retype, rather than blanking it', async () => {
    const cookie = await signIn(bench.server)
    await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { displayName: 'Renamed' })({ cookie }),
    )

    const sent = web.sent.find(one => one.method === 'PATCH')
    expect(Object.keys(sent?.body as object)).toEqual(['displayName'])
  })

  it('carries a retyped credential to the product and never back to the page', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { apiKey: PROVIDER_KEY })({ cookie }),
    )

    expect((web.sent.find(one => one.method === 'PATCH')?.body as { apiKey: string }).apiKey)
      .toBe(PROVIDER_KEY)
    expect(res.body).not.toContain(PROVIDER_KEY)
    expect(res.body).not.toContain(API_KEY)
  })

  it('forwards the managed-row refusal verbatim, fields and all', async () => {
    const { cookie } = await withProduct({
      'PATCH /api/desktop/providers/p_1': {
        status: 409,
        body: { error: 'managed_provider_readonly', fields: ['prefix', 'apiKey'] },
      },
    })
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { prefix: 'NEW1', apiKey: 'sk' })({ cookie }),
    )

    expect(res.json()).toEqual({
      status: 'refused',
      reason: 'managed_provider_readonly',
      fields: ['prefix', 'apiKey'],
    })
  })

  it('refuses a patch that names nothing to change, before spending a request', async () => {
    const cookie = await signIn(bench.server)
    const before = web.sent.length
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { unknownField: 1 })({ cookie }),
    )

    expect(res.status).toBe(400)
    expect(web.sent.length).toBe(before)
  })

  it('reports a failure when the product answers something it cannot read', async () => {
    const { cookie } = await withProduct({
      'PATCH /api/desktop/providers/p_1': { body: { provider: null } },
    })
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PATCH', { displayName: 'Renamed' })({ cookie }),
    )

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI provider could not be updated.' })
  })

  it('deletes the row, sending no body with the request', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('DELETE')({ cookie }),
    )

    expect(res.json()).toEqual({ status: 'deleted' })
    const sent = web.sent.find(one => one.method === 'DELETE')
    expect(sent?.url).toBe(`${PRODUCT}/api/desktop/providers/p_1`)
    expect(sent?.body).toBeUndefined()
  })

  it('forwards a refused delete as the product named it', async () => {
    const { cookie } = await withProduct({
      'DELETE /api/desktop/providers/p_1': {
        status: 409,
        body: { error: 'managed_provider_readonly', fields: ['*'] },
      },
    })
    const res = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('DELETE')({ cookie }),
    )

    expect(res.json()).toEqual({
      status: 'refused',
      reason: 'managed_provider_readonly',
      fields: ['*'],
    })
  })

  it('escapes a row id into the product path instead of building a new one', async () => {
    const cookie = await signIn(bench.server)
    await call(
      bench.server.handler('/auth/providers/a%2Fb'),
      row('DELETE', undefined, 'a%2Fb')({ cookie }),
    )

    expect(web.sent.find(one => one.method === 'DELETE')?.url)
      .toBe(`${PRODUCT}/api/desktop/providers/a%2Fb`)
  })

  it('answers signed-out with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/providers/p_1'), row('DELETE')({}))

    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('claims neither a verb nor a path it does not serve', async () => {
    const cookie = await signIn(bench.server)
    const put = await call(
      bench.server.handler('/auth/providers/p_1'),
      row('PUT', {})({ cookie }),
    )
    expect(put.status).toBe(405)

    const deep = await call(
      bench.server.handler('/auth/providers/p_1/sync'),
      row('PATCH', {}, 'p_1/sync')({ cookie }),
    )
    expect(deep.status).toBe(404)
  })

  it('keeps the collection route on the exact path it was registered at', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/providers'), request({ cookie }))
    expect(res.json()).toEqual({ status: 'signed-in', providers: [ROW] })
  })
})
