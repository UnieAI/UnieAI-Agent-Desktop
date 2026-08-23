/**
 * The startup reader against every answer a host can give it, and against a
 * host that gives none.
 *
 * The failure paths are the point of this suite. The desktop's first frame
 * waits on this object, so a host that is slow, silent, ahead of this build,
 * or absent altogether must each end in a snapshot the surfaces can act on —
 * never in a wait that does not end.
 */
import { describe, expect, it, vi } from 'vitest'
import { BootstrapReader, readBootstrapResponse } from '../src/client/reader.ts'
import type { BootstrapEnvironment } from '../src/client/reader.ts'

const ACCOUNT = { status: 'signed-in', snapshot: { user: { id: 'u_1' } } }
const PROVIDERS = { status: 'signed-in', providers: [] }
const MODELS = { status: 'signed-in', models: [] }
const MCP = { status: 'signed-in', servers: [] }

/** Every part gathered. */
const COMPLETE = {
  status: 'ready',
  parts: { account: ACCOUNT, providers: PROVIDERS, models: MODELS, mcp: MCP },
  pending: [],
}

/** One host, answering the given bodies in order. */
function host(...answers: ({ ok?: boolean; body: unknown } | 'reject' | 'hang')[]) {
  const paths: string[] = []
  let index = 0
  const request = (path: string, init?: RequestInit): Promise<Response> => {
    paths.push(path)
    const answer = answers[Math.min(index++, answers.length - 1)]
    if (answer === 'reject') return Promise.reject(new Error('network is down'))
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
      })
    }
    return Promise.resolve({
      ok: answer?.ok ?? true,
      json: () => Promise.resolve(answer?.body),
    } as Response)
  }
  return { paths, request }
}

/**
 * A reader over one host.
 * @param environment - the host and any timing overrides.
 * @returns the reader.
 */
const reader = (environment: BootstrapEnvironment): BootstrapReader => new BootstrapReader(environment)

describe('startup answer reader', () => {
  it('starts pending, before anything has been read', () => {
    expect(reader({ request: host({ body: COMPLETE }).request }).getSnapshot())
      .toEqual({ status: 'pending', parts: {} })
  })

  it('publishes every gathered part under one status', async () => {
    const web = host({ body: COMPLETE })
    const startup = reader({ request: web.request })
    const changes: string[] = []
    startup.subscribe(() => { changes.push(startup.getSnapshot().status) })

    await startup.refresh()

    expect(web.paths).toEqual(['/auth/bootstrap'])
    expect(startup.getSnapshot()).toEqual({
      status: 'ready',
      parts: { account: ACCOUNT, providers: PROVIDERS, models: MODELS, mcp: MCP },
    })
    expect(changes).toEqual(['ready'])
  })

  it('publishes signed-out as a state rather than a failure', async () => {
    const startup = reader({ request: host({ body: { status: 'signed-out', parts: {}, pending: [] } }).request })
    await startup.refresh()

    expect(startup.getSnapshot()).toEqual({ status: 'signed-out', parts: {} })
  })

  it('reports the parts that did land, and asks once more for the rest', async () => {
    const partial = { status: 'partial', parts: { account: ACCOUNT }, pending: ['providers', 'models', 'mcp'] }
    const web = host({ body: partial }, { body: COMPLETE })
    const startup = reader({ request: web.request, followUpDelayMs: 1 })

    await startup.refresh()
    expect(startup.getSnapshot().status).toBe('partial')
    expect(startup.getSnapshot().parts).toEqual({ account: ACCOUNT })

    await vi.waitUntil(() => startup.getSnapshot().status === 'ready')
    expect(web.paths.length).toBe(2)
  })

  it('asks once more and then stops, however partial the follow-up is', async () => {
    const partial = { status: 'partial', parts: {}, pending: ['account', 'providers', 'models', 'mcp'] }
    const web = host({ body: partial })
    const startup = reader({ request: web.request, followUpDelayMs: 1 })

    await startup.refresh()
    await new Promise((resolve) => { setTimeout(resolve, 30) })

    // Two reads, not a poll: a warm start owes the desktop one more attempt,
    // not a permanent conversation with a host that cannot finish.
    expect(web.paths.length).toBe(2)
    startup.dispose()
  })

  it('uses its own follow-up delay when a composition names none', async () => {
    const web = host({ body: { status: 'partial', parts: {}, pending: ['account'] } })
    const startup = reader({ request: web.request })

    await startup.refresh()

    // Scheduled on the package's own delay rather than immediately: one more
    // attempt is a warm start, and asking again at once would be a retry loop.
    expect(web.paths.length).toBe(1)
    startup.dispose()
  })

  it('reports unavailable when the host will not answer, so surfaces fall back', async () => {
    const startup = reader({ request: host('reject').request })
    await startup.refresh()

    expect(startup.getSnapshot()).toEqual({ status: 'unavailable', parts: {} })
  })

  it('reports unavailable for a build whose host has no startup route', async () => {
    const startup = reader({ request: host({ ok: false, body: {} }).request })
    await startup.refresh()

    expect(startup.getSnapshot().status).toBe('unavailable')
  })

  it('stops waiting on a host that never answers', async () => {
    const startup = reader({ request: host('hang').request, readTimeoutMs: 10 })

    const started = Date.now()
    await startup.refresh()

    expect(startup.getSnapshot().status).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('reports unavailable for an answer it cannot read', async () => {
    for (const body of [undefined, 'nonsense', { status: 'something-new' }]) {
      const startup = reader({ request: host({ body }).request })
      await startup.refresh()
      expect(startup.getSnapshot().status).toBe('unavailable')
    }
  })

  it('reports unavailable when the body is not JSON at all', async () => {
    const startup = reader({
      request: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('not json')) } as unknown as Response),
    })
    await startup.refresh()

    expect(startup.getSnapshot().status).toBe('unavailable')
  })

  it('drops a part this build has no consumer for', () => {
    const snapshot = readBootstrapResponse({
      status: 'ready',
      parts: { account: ACCOUNT, providers: PROVIDERS, models: MODELS, mcp: MCP, telemetry: { status: 'signed-in' } },
    })

    expect(Object.keys(snapshot?.parts ?? {})).toEqual(['account', 'providers', 'models', 'mcp'])
  })

  it('believes what arrived rather than what the host called it', () => {
    expect(readBootstrapResponse({ status: 'ready', parts: { account: ACCOUNT } })?.status).toBe('partial')
    expect(readBootstrapResponse({ status: 'partial', parts: {} })?.parts).toEqual({})
  })

  it('reads an answer whose parts field is missing entirely', () => {
    expect(readBootstrapResponse({ status: 'partial' })).toEqual({ status: 'partial', parts: {} })
  })

  it('stops publishing once disposed, and cancels the read in flight', async () => {
    const web = host('hang')
    const startup = reader({ request: web.request, readTimeoutMs: 5000 })
    const changes: string[] = []
    const off = startup.subscribe(() => { changes.push('moved') })

    const reading = startup.refresh()
    startup.dispose()
    await reading

    expect(changes).toEqual([])
    expect(startup.getSnapshot().status).toBe('pending')
    off()
  })

  it('cancels a follow-up it is disposed before', async () => {
    const web = host({ body: { status: 'partial', parts: {}, pending: ['account'] } })
    const startup = reader({ request: web.request, followUpDelayMs: 5 })
    await startup.refresh()

    startup.dispose()
    await new Promise((resolve) => { setTimeout(resolve, 30) })

    expect(web.paths.length).toBe(1)
  })

  it('stops notifying a listener that unsubscribed', async () => {
    const web = host({ body: COMPLETE })
    const startup = reader({ request: web.request })
    let moves = 0
    const off = startup.subscribe(() => { moves += 1 })
    off()

    await startup.refresh()

    expect(moves).toBe(0)
  })
})
