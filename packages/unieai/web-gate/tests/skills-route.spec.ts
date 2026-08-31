/**
 * `/auth/skills` and `/auth/skills/<slug>` through the gate's own session table.
 *
 * The listing is a page's; the document is a host's. Both spend the desktop
 * API key on the product and neither may hand it back, so the suite asserts
 * against the whole serialized answer rather than the fields it expects.
 *
 * The slug matters more here than an identifier usually does: it becomes a
 * directory name on someone's machine. A slug carrying a separator or a parent
 * reference is refused by this route as well as by the product, because this
 * is the side where a path eventually gets built out of it.
 */
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_KEY, call, gate, product, signIn } from './gate-bench.ts'
import type { Answer } from './gate-bench.ts'

/**
 * One incoming request that carries its own URL.
 *
 * The bench's own helper does not, and the document route reads the slug out
 * of the path — a request with no URL would be a test of the empty slug.
 * @param headers - request headers, typically just a cookie.
 * @param url - the path this request was made to.
 * @returns the request object the handlers take.
 */
function request(headers: Record<string, string>, url = '/auth/skills'): IncomingMessage {
  return Object.assign(Readable.from([]), { headers, method: 'GET', url }) as unknown as IncomingMessage
}

const SKILL = {
  slug: 'weekly-report',
  name: 'Weekly Report',
  description: 'Writes the Monday summary.',
  origin: 'personal',
  enabled: true,
  attachments: ['scripts/build.sh'],
}

const DOCUMENT = '---\nname: "Weekly Report"\ndescription: "Writes the Monday summary."\n---\n\nBody.\n'

let bench: ReturnType<typeof gate>
let web: ReturnType<typeof product>

const skills = (answer: Answer): Record<string, Answer> => ({ 'GET /api/desktop/skills': answer })

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
  web = product({
    ...skills({ body: { skills: [SKILL] } }),
    'GET /api/desktop/skills/weekly-report': {
      body: { slug: 'weekly-report', name: 'Weekly Report', content: DOCUMENT },
    },
  })
  bench = gate()
  await bench.fiber.await()
})

afterEach(async () => {
  await bench.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('GET /auth/skills', () => {
  it('answers signed-out to a browser with no session, without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/skills'), request({}))

    expect(res.status).toBe(200)
    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('lists the account skills, and never hands back the API key', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/skills'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', skills: [SKILL] })
    expect(res.body).not.toContain(API_KEY)
    expect(web.sent.map(one => one.authorization)).toContain(`Bearer ${API_KEY}`)
  })

  it('keeps an account with no skills apart from a product that could not answer', async () => {
    const { cookie } = await withProduct(skills({ body: { skills: [] } }))
    const empty = await call(bench.server.handler('/auth/skills'), request({ cookie }))
    expect(empty.json()).toEqual({ status: 'signed-in', skills: [] })

    const failed = await withProduct(skills({ status: 502, body: { error: 'skills_unavailable' } }))
    const res = await call(bench.server.handler('/auth/skills'), request({ cookie: failed.cookie }))
    expect((res.json() as { status: string }).status).toBe('failed')
  })

  it('says WHICH failure, because four unrelated ones land on the same screen', async () => {
    // "The skills on your UnieAI account could not be read." covered an
    // unreachable product, a refused key, a build with no such route and an
    // answer that did not parse — one sentence a person cannot act on, and a
    // bug report that names nothing. Each says which it was.
    const refused = await withProduct(skills({ status: 401, body: {} }))
    const unauthorized = await call(
      bench.server.handler('/auth/skills'), request({ cookie: refused.cookie }))
    expect((unauthorized.json() as { message: string }).message).toContain('refused')

    const absent = await withProduct(skills({ status: 404, body: {} }))
    const missing = await call(
      bench.server.handler('/auth/skills'), request({ cookie: absent.cookie }))
    expect((missing.json() as { message: string }).message).toContain('does not serve a skills list')

    const nonsense = await withProduct(skills({ body: { unexpected: true } }))
    const malformed = await call(
      bench.server.handler('/auth/skills'), request({ cookie: nonsense.cookie }))
    expect((malformed.json() as { message: string }).message).toContain('does not understand')
  })

  it('drops a row whose slug is not a directory name', async () => {
    // The slug is joined onto a skills directory on this machine; a product
    // build that published a path would otherwise write outside it.
    const { cookie } = await withProduct(skills({
      body: {
        skills: [
          { ...SKILL, slug: '../../etc/cron.d' },
          { ...SKILL, slug: '..' },
          { ...SKILL, slug: 'a/b' },
          SKILL,
        ],
      },
    }))
    const res = await call(bench.server.handler('/auth/skills'), request({ cookie }))

    expect(res.json()).toEqual({ status: 'signed-in', skills: [SKILL] })
  })
})

describe('GET /auth/skills/<slug>', () => {
  it('answers the whole document, frontmatter included', async () => {
    const cookie = await signIn(bench.server)
    const res = await call(bench.server.handler('/auth/skills/weekly-report'), request({ cookie }, '/auth/skills/weekly-report'))

    expect(res.json()).toEqual({
      status: 'signed-in',
      skill: { slug: 'weekly-report', name: 'Weekly Report', content: DOCUMENT },
    })
    expect(res.body).not.toContain(API_KEY)
  })

  it('answers signed-out without calling the product', async () => {
    const before = web.sent.length
    const res = await call(bench.server.handler('/auth/skills/weekly-report'), request({}, '/auth/skills/weekly-report'))

    expect(res.json()).toEqual({ status: 'signed-out' })
    expect(web.sent.length).toBe(before)
  })

  it('refuses a slug that is not one plain segment, before asking anything', async () => {
    const cookie = await signIn(bench.server)
    const before = web.sent.length
    for (const slug of ['..', '.', 'a%2Fb', '-leading-dash']) {
      const res = await call(
        bench.server.handler(`/auth/skills/${slug}`),
        request({ cookie }, `/auth/skills/${slug}`),
      )
      expect(res.status, slug).toBe(404)
    }
    expect(web.sent.length).toBe(before)
  })

  it('keeps a skill the account no longer has apart from a read that failed', async () => {
    const gone = await withProduct({
      ...skills({ body: { skills: [] } }),
      'GET /api/desktop/skills/weekly-report': { status: 404, body: { error: 'skill_not_found' } },
    })
    const missing = await call(bench.server.handler('/auth/skills/weekly-report'),
      request({ cookie: gone.cookie }, '/auth/skills/weekly-report'))
    expect(missing.status).toBe(404)

    const broken = await withProduct({
      ...skills({ body: { skills: [] } }),
      'GET /api/desktop/skills/weekly-report': { status: 502, body: { error: 'skills_unavailable' } },
    })
    const res = await call(bench.server.handler('/auth/skills/weekly-report'),
      request({ cookie: broken.cookie }, '/auth/skills/weekly-report'))
    expect(res.status).toBe(200)
    expect((res.json() as { status: string }).status).toBe('failed')
  })

  it('refuses an empty document rather than writing a skill with no body', async () => {
    const { cookie } = await withProduct({
      ...skills({ body: { skills: [SKILL] } }),
      'GET /api/desktop/skills/weekly-report': { body: { slug: 'weekly-report', name: 'x', content: '   ' } },
    })
    const res = await call(bench.server.handler('/auth/skills/weekly-report'), request({ cookie }, '/auth/skills/weekly-report'))

    expect((res.json() as { status: string }).status).toBe('failed')
  })
})

describe('the host-side seam', () => {
  it('reads one document through ctx.unieaiGate, which is what writes the file', async () => {
    await signIn(bench.server)
    const document = await bench.ctx.unieaiGate.accountSkill('weekly-report')

    expect(document).toEqual({ slug: 'weekly-report', name: 'Weekly Report', content: DOCUMENT })
  })

  it('answers undefined to a host reader while nobody is signed in', async () => {
    // Not `not-found`: there is no account to have the skill or to lack it.
    expect(await bench.ctx.unieaiGate.accountSkill('weekly-report')).toBeUndefined()
  })
})
