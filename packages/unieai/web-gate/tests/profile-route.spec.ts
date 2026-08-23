/**
 * `/auth/profile` end to end through the gate's own session table.
 *
 * The route exists for the same reason `/auth/account` does: the API key that
 * authenticates the product's `/api/desktop/*` surface lives in that table and
 * must never reach a page. The suite signs a browser in the way the device
 * flow does, reads and writes the profile, and checks the whole serialized
 * answer for the key — not just the fields it expects to find.
 *
 * The other property under test is the three-way avatar intent. A save that
 * carries no `image` must reach the product carrying none, because the product
 * reads that as "leave the stored photo alone"; collapsing it to `null` would
 * delete an avatar on every name-only save.
 */
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@unieai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebRoute } from '@unieai/uad-host-webserver'
import { apply, Config } from '../src/index.ts'

type WebRouteHandler = WebRoute['handler']

const PRODUCT = 'https://product.test'
const API_KEY = 'sk-desktop-super-secret'
const PROFILE_URL = `${PRODUCT}/api/desktop/profile`

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
  method?: string,
): IncomingMessage {
  const payload = body === undefined
    ? []
    : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  return Object.assign(Readable.from(payload), {
    headers,
    ...(method === undefined ? {} : { method }),
  }) as unknown as IncomingMessage
}

const call = async (handler: WebRouteHandler, req: IncomingMessage): Promise<CapturedResponse> => {
  const res = new CapturedResponse()
  await handler(req, res as unknown as ServerResponse)
  return res
}

/** One recorded outbound call to the product. */
interface ProductCall {
  url: string
  method: string
  authorization: string | undefined
  body: unknown
}

/** The product, answering the device grant and the profile route. */
function product(options: { profile?: unknown; patchOk?: boolean; patchRefusal?: string } = {}) {
  const calls: ProductCall[] = []
  const stored = options.profile === undefined
    ? { name: 'Ada', email: 'ada@unieai.com', image: 'data:image/png;base64,OLD' }
    : options.profile
  vi.stubGlobal('fetch', (url: string, init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  }) => {
    const method = init?.method ?? 'GET'
    calls.push({
      url,
      method,
      authorization: init?.headers?.['authorization'],
      body: init?.body === undefined ? undefined : JSON.parse(init.body) as unknown,
    })
    if (url === `${PRODUCT}/api/desktop/device/poll`) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          status: 'approved',
          api_key: API_KEY,
          user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
        }),
      })
    }
    if (url === PROFILE_URL) {
      if (method === 'PATCH' && options.patchOk === false) {
        // The product answers a rejected PATCH with a bare sentence, not JSON,
        // so the stub carries `text` — that is what the gate reads to name
        // which refusal happened.
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(options.patchRefusal ?? ''),
        })
      }
      if (stored === null) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stored) })
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
  })
  return { calls }
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
  const cookie = res.headers['set-cookie']?.split(';')[0]
  if (cookie === undefined) throw new Error('the poll set no session cookie')
  return cookie
}

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

beforeEach(async () => {
  web = product()
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('/auth/profile reading', () => {
  it('answers signed-out to a browser with no session', async () => {
    const res = await call(bench.server.handler('/auth/profile'), request({}))
    expect(res.json()).toEqual({ status: 'signed-out' })
  })

  it('answers with the profile the product reported', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/profile'), request({ cookie }))

    expect(res.json()).toEqual({
      status: 'signed-in',
      profile: { name: 'Ada', email: 'ada@unieai.com', image: 'data:image/png;base64,OLD' },
    })
  })

  it('keeps an unset name and an unset avatar null, rather than inventing either', async () => {
    web = product({ profile: { email: 'ada@unieai.com' } })
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    const res = await call(fresh.server.handler('/auth/profile'), request({ cookie }))
    await fresh.fiber.dispose()

    expect(res.json()).toEqual({
      status: 'signed-in',
      profile: { name: null, email: 'ada@unieai.com', image: null },
    })
  })

  it('never writes the session API key into the answer', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/profile'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.calls.map(entry => entry.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('reports a failure for a body that names no account, not an empty profile', async () => {
    for (const shape of [{ name: 'Ada' }, 'ada', null]) {
      web = product({ profile: shape })
      const fresh = gate()
      await fresh.fiber.await()
      const cookie = await signIn(fresh.server)
      const res = await call(fresh.server.handler('/auth/profile'), request({ cookie }))
      await fresh.fiber.dispose()
      expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI profile could not be read.' })
    }
  })

  it('reports a failure, not an empty profile, when the product will not answer', async () => {
    web = product({ profile: null })
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    const res = await call(fresh.server.handler('/auth/profile'), request({ cookie }))
    await fresh.fiber.dispose()

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI profile could not be read.' })
  })
})

describe('/auth/profile saving', () => {
  it('forwards a name-only save with no avatar field at all', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(
      bench.server.handler('/auth/profile'),
      request({ cookie }, { name: 'Ada Lovelace' }, 'POST'),
    )

    expect(res.json()).toEqual({
      status: 'saved',
      profile: { name: 'Ada', email: 'ada@unieai.com', image: 'data:image/png;base64,OLD' },
    })
    const patch = web.calls.find(entry => entry.method === 'PATCH')
    expect(patch?.body).toEqual({ name: 'Ada Lovelace' })
    // Absent, never null: `null` is the product's "delete the photo".
    expect(patch?.body as Record<string, unknown>).not.toHaveProperty('image')
  })

  it('forwards an avatar with both of its identifications', async () => {
    const cookie = await signIn(bench.server)
    await call(bench.server.handler('/auth/profile'), request({ cookie }, {
      name: 'Ada Lovelace',
      image: 'data:image/png;base64,NEW',
      imageMimeType: 'image/png',
      imageExtension: '.png',
    }, 'POST'))

    expect(web.calls.find(entry => entry.method === 'PATCH')?.body).toEqual({
      name: 'Ada Lovelace',
      image: 'data:image/png;base64,NEW',
      imageMimeType: 'image/png',
      imageExtension: '.png',
    })
  })

  it('forwards an explicit clear as the product\'s own null', async () => {
    const cookie = await signIn(bench.server)
    await call(bench.server.handler('/auth/profile'), request({ cookie }, {
      name: 'Ada Lovelace',
      image: null,
    }, 'POST'))

    expect(web.calls.find(entry => entry.method === 'PATCH')?.body).toEqual({
      name: 'Ada Lovelace',
      image: null,
      imageMimeType: null,
      imageExtension: null,
    })
  })

  it('re-reads the profile after the write, so the answer is what was stored', async () => {
    const cookie = await signIn(bench.server)
    // The sign-in starts the startup warm-up, whose account gather reads this
    // same profile; the write path is what this asserts, so the calls it made
    // are counted from the save onwards.
    const before = web.calls.length
    await call(bench.server.handler('/auth/profile'), request({ cookie }, { name: 'Ada Lovelace' }, 'POST'))

    expect(web.calls.slice(before).filter(entry => entry.url === PROFILE_URL).map(entry => entry.method))
      .toEqual(['PATCH', 'GET'])
  })

  it('reports the product\'s refusal as a failure rather than a save', async () => {
    web = product({ patchOk: false })
    const fresh = gate()
    await fresh.fiber.await()
    const cookie = await signIn(fresh.server)
    const res = await call(
      fresh.server.handler('/auth/profile'),
      request({ cookie }, { name: '' }, 'POST'),
    )
    await fresh.fiber.dispose()

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI profile could not be saved.' })
  })

  it('refuses a save that names no display name, without calling the product', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/profile'), request({ cookie }, { image: 'x' }, 'POST'))

    expect(res.status).toBe(400)
    // The gate's own shape check reports the product's own identifier for the
    // same condition, so the page has one line for it either way.
    expect(res.json()).toEqual({
      status: 'failed',
      reason: 'name-required',
      message: 'The UnieAI profile could not be saved.',
    })
    expect(web.calls.some(entry => entry.method === 'PATCH')).toBe(false)
  })

  it('names which refusal the product reported, so the page can say it', async () => {
    for (const [sentence, reason] of [
      ['Name is required', 'name-required'],
      ['Unsupported avatar format', 'avatar-format'],
      ['Invalid image payload', 'avatar-payload'],
    ] as const) {
      vi.unstubAllGlobals()
      product({ patchOk: false, patchRefusal: sentence })
      const fresh = gate()
      await fresh.fiber.await()
      const cookie = await signIn(fresh.server)
      const res = await call(
        fresh.server.handler('/auth/profile'),
        request({ cookie }, { name: 'Ada' }, 'POST'),
      )
      await fresh.fiber.dispose()

      // The identifier, never the product's English sentence: only the browser
      // knows the reader's language.
      expect(res.json()).toMatchObject({ status: 'failed', reason })
      expect(res.body).not.toContain(sentence)
    }
  })

  it('refuses a body that is not JSON', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/profile'), request({ cookie }, 'not json', 'POST'))

    expect(res.status).toBe(400)
    expect(web.calls.some(entry => entry.method === 'PATCH')).toBe(false)
  })

  it('refuses a body larger than it will buffer, without calling the product', async () => {
    const cookie = await signIn(bench.server)
    const oversized = JSON.stringify({ name: 'Ada', image: `data:image/png;base64,${'A'.repeat(13 * 1024 * 1024)}` })
    const res = await call(bench.server.handler('/auth/profile'), request({ cookie }, oversized, 'POST'))

    expect(res.status).toBe(400)
    expect(web.calls.some(entry => entry.method === 'PATCH')).toBe(false)
  })

  it('reports an unreachable product as a failure, on both halves of the route', async () => {
    const cookie = await signIn(bench.server)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    const read = await call(bench.server.handler('/auth/profile'), request({ cookie }))
    expect(read.json()).toEqual({ status: 'failed', message: 'The UnieAI profile could not be read.' })

    const write = await call(
      bench.server.handler('/auth/profile'),
      request({ cookie }, { name: 'Ada' }, 'POST'),
    )
    expect(write.json()).toEqual({ status: 'failed', message: 'The UnieAI profile could not be saved.' })
  })

  it('answers signed-out to a save from a browser with no session', async () => {
    const res = await call(bench.server.handler('/auth/profile'), request({}, { name: 'Ada' }, 'POST'))
    expect(res.json()).toEqual({ status: 'signed-out' })
  })
})
