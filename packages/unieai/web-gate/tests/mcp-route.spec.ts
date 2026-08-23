/**
 * `/auth/mcp` end to end through the gate's own session table.
 *
 * Two credentials meet on this route and neither may reach a page: the desktop
 * API key that authenticates the read, and the per-server bearer the product
 * mints for the account. The suite asserts both against the WHOLE serialized
 * answer rather than against the fields it expects, because a projection that
 * merely happens not to copy a secret today is not the same as one that
 * cannot.
 *
 * The host-side seam is checked here too: the same grants, bearer included,
 * must be readable through `ctx.unieaiGate` — that is the only way the MCP
 * supervisor can mount a server, and it is the reason the browser projection
 * can afford to withhold so much.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY, PRODUCT, call, gate, product, request, signIn } from './gate-bench.ts'
import type { Answer } from './gate-bench.ts'

const TOKEN = 'mcp-bearer-do-not-disclose'

const SERVER = {
  id: 'unieai-studio',
  label: 'UnieAI Studio',
  url: `${PRODUCT}/api/agent-next/studio-mcp?session=secret-path-part`,
  token: TOKEN,
  expiresAt: '2026-08-22T12:00:00.000Z',
  tools: ['studio_search', 'studio_sql'],
}

/** What the browser is supposed to see for {@link SERVER}. */
const VIEW = {
  id: 'unieai-studio',
  label: 'UnieAI Studio',
  origin: PRODUCT,
  expiresAt: '2026-08-22T12:00:00.000Z',
  tools: ['studio_search', 'studio_sql'],
}

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

const mcp = (answer: Answer): Record<string, Answer> => ({ 'GET /api/desktop/mcp': answer })

/**
 * Bring up a gate whose product answers the given overrides, and sign in.
 * @param overrides - answers by `"<METHOD> <path>"`.
 * @returns the session cookie.
 */
async function withProduct(overrides: Record<string, Answer>): Promise<{ cookie: string }> {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
  web = product(overrides)
  bench = gate()
  await bench.fiber.await()
  return { cookie: await signIn(bench.server) }
}

beforeEach(async () => {
  web = product(mcp({ body: { servers: [SERVER] } }))
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('GET /auth/mcp', () => {
  it('answers signed-out to a browser with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/mcp'), request({}))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('never sends the server bearer to the browser', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.body).not.toContain(TOKEN)
    expect(JSON.stringify(res.headers)).not.toContain(TOKEN)
  })

  it('never sends the desktop API key to the browser, and spends it on the product', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.body).not.toContain(API_KEY)
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('answers with the origin, not the endpoint, so a token in the path cannot leak', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', servers: [VIEW] })
    expect(res.body).not.toContain('secret-path-part')
  })

  it('drops nothing else the product attached, whatever it sends', async () => {
    const { cookie } = await withProduct(mcp({
      body: {
        servers: [{
          ...SERVER,
          // A future or misbehaving product build that attached these must not
          // be able to widen what a page holds: the view is built field by
          // field, so an unknown field has nowhere to go.
          refreshToken: 'rt-secret',
          upstreamApiKey: 'sk-provider-secret',
        }],
      },
    }))
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.body).not.toContain('rt-secret')
    expect(res.body).not.toContain('sk-provider-secret')
    expect(res.json()).toEqual({ status: 'signed-in', servers: [VIEW] })
  })

  it('drops a server it could not mount rather than showing one it cannot dial', async () => {
    const { cookie } = await withProduct(mcp({
      body: {
        servers: [
          { ...SERVER, id: 'no-token', token: '' },
          { ...SERVER, id: 'no-url', url: '' },
          SERVER,
        ],
      },
    }))
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', servers: [VIEW] })
  })

  it('answers an empty list for an account that has connected nothing', async () => {
    const { cookie } = await withProduct(mcp({ body: { servers: [] } }))
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', servers: [] })
  })

  it('reports a failure, not an empty list, when the product will not answer', async () => {
    const { cookie } = await withProduct(mcp({ status: 502, body: { error: 'mcp_unavailable' } }))
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    // A broken binding and an account with nothing connected are different
    // facts; a surface that has to choose what to say needs them apart.
    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI MCP servers could not be read.' })
  })

  it('reports a failure when the product answers something it cannot read', async () => {
    const { cookie } = await withProduct(mcp({ body: { servers: 'not-a-list' } }))
    const res = await call(bench.server.handler('/auth/mcp'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'failed', message: 'The UnieAI MCP servers could not be read.' })
  })
})

describe('the host-side gate seam', () => {
  it('holds no session before a sign-in, and reads nothing on one', async () => {
    expect(bench.host().session()).toBeUndefined()
    await expect(bench.host().mcpServers()).resolves.toBeUndefined()
  })

  it('hands a host consumer the bearer the browser is denied', async () => {
    await signIn(bench.server)

    expect(bench.host().session()).toEqual({ userId: 'u_1', apiKey: API_KEY })
    await expect(bench.host().mcpServers()).resolves.toEqual([{
      id: 'unieai-studio',
      label: 'UnieAI Studio',
      url: SERVER.url,
      token: TOKEN,
      expiresAt: SERVER.expiresAt,
      tools: ['studio_search', 'studio_sql'],
    }])
  })

  it('announces a sign-in and the loss of the last session', async () => {
    const seen: Array<string | undefined> = []
    bench.ctx.on('unieai-gate/session', (session) => { seen.push(session?.userId) })

    const cookie = await signIn(bench.server)
    await call(bench.server.handler('/auth/logout'), request({ cookie }))

    expect(seen).toEqual(['u_1', undefined])
    expect(bench.host().session()).toBeUndefined()
  })
})
