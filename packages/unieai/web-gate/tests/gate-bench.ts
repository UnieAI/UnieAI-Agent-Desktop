/**
 * Shared bench for the `/auth/*` route suites added with the activity and MCP
 * routes: a captured WebServer route table, a stubbed product, and the device
 * poll that puts a real session in the gate's own table.
 *
 * Signing in through the poll rather than reaching into the table is what
 * makes these suites able to assert the thing that matters — that the API key
 * the product handed out never appears in an answer — against the same code
 * path a browser takes.
 */
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@unieai/cordis'
import { expect, vi } from 'vitest'
import type { WebRoute } from '@unieai/uad-host-webserver'
import { apply, Config } from '../src/index.ts'
import type { UnieaiGate } from '../src/index.ts'

/** What a route table stores against one path. */
export type WebRouteHandler = WebRoute['handler']

/** Origin the stubbed product answers on. */
export const PRODUCT = 'https://product.test'
/** The desktop API key the device grant hands back; nothing may disclose it. */
export const API_KEY = 'sk-desktop-super-secret'

/**
 * One captured route table, standing in for the WebServer service.
 *
 * Exact and prefix rows are kept apart and resolved the way the real service
 * resolves them — exact first, then longest matching prefix — because the gate
 * registers both kinds at `/auth/providers`, and a table keyed by path alone
 * would let one silently replace the other.
 */
export function webServer() {
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
export class CapturedResponse {
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

/**
 * One incoming request.
 * @param headers - request headers, typically just a cookie.
 * @param body - JSON body to stream, when the route reads one.
 * @param method - HTTP method.
 * @returns the request object the handlers take.
 */
export function request(headers: Record<string, string>, body?: unknown, method = 'GET'): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return Object.assign(Readable.from(payload), { headers, method }) as unknown as IncomingMessage
}

/**
 * Drive one handler and capture what it wrote.
 * @param handler - the route handler under test.
 * @param req - the request to hand it.
 * @returns the captured response.
 */
export const call = async (handler: WebRouteHandler, req: IncomingMessage): Promise<CapturedResponse> => {
  const res = new CapturedResponse()
  await handler(req, res as unknown as ServerResponse)
  return res
}

/** One recorded outbound call to the product. */
export interface Sent {
  url: string
  method: string
  authorization: string | undefined
}

/** One stubbed product answer. */
export interface Answer {
  status?: number
  body: unknown
}

/**
 * Stub the product, answering the device grant plus whatever the suite adds.
 * @param overrides - answers by `"<METHOD> <path>"`, replacing the defaults.
 * @returns the recorded outbound calls.
 */
export function product(overrides: Record<string, Answer> = {}) {
  const sent: Sent[] = []
  const answers: Record<string, Answer> = {
    'POST /api/desktop/device/poll': {
      body: {
        status: 'approved',
        api_key: API_KEY,
        user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
      },
    },
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

/**
 * One mounted gate: the captured route table, its Cordis context, and its
 * fiber.
 * @param overrides - config keys this suite is actually testing; everything
 * else keeps the spelled-out posture below.
 * @returns the mounted gate.
 */
export function gate(overrides: Partial<Config> = {}) {
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
    ...overrides,
  })
  return { server, ctx, fiber, host: (): UnieaiGate => ctx.get('unieaiGate') as UnieaiGate }
}

/**
 * Sign one browser in through the device poll.
 * @param server - the captured route table.
 * @returns the `name=value` cookie header a later request presents.
 */
export async function signIn(server: ReturnType<typeof webServer>): Promise<string> {
  const res = await call(server.handler('/auth/device/poll'), request({}, { deviceCode: 'dc_1' }, 'POST'))
  expect(res.json()).toEqual({ status: 'approved' })
  const cookie = res.headers['set-cookie']?.split(';')[0]
  if (cookie === undefined) throw new Error('the poll set no session cookie')
  return cookie
}
