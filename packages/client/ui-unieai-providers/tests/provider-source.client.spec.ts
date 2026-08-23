/**
 * The provider source against a driven host route.
 *
 * Two properties carry the design and are asserted directly: the source keeps
 * NO local copy of the list (every write is followed by a re-read, not by
 * patching the array it already has), and no answer it accepts can put a
 * provider credential into the state, because the row it builds has no field
 * for one.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  failureFor, ProviderSource, readProviderRow, readProvidersResponse,
  type ProviderEnvironment, type ProvidersState,
} from '../src/client/provider-source.ts'

const ROW = {
  id: 'p_1',
  displayName: 'Acme',
  prefix: 'ACME',
  apiUrl: 'https://gateway.acme.example/v1',
  enabled: true,
  managed: false,
  models: ['a', 'b'],
  selectedModels: ['a'],
}

/** A host answering a queue of bodies, recording what was asked of it. */
function host(bodies: unknown[], ok = true) {
  const calls: { path: string; init: RequestInit | undefined }[] = []
  const environment: ProviderEnvironment = {
    request: (path, init) => {
      calls.push({ path, init })
      const body = bodies.length > 1 ? bodies.shift() : bodies[0]
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(body),
      } as Response)
    },
  }
  return { environment, calls }
}

describe('reading one provider', () => {
  it('builds a row with no place for a credential to land', () => {
    const row = readProviderRow({ ...ROW, apiKey: 'sk-should-not-survive' })
    expect(JSON.stringify(row)).not.toContain('sk-should-not-survive')
    expect(row).toEqual({
      id: 'p_1',
      displayName: 'Acme',
      prefix: 'ACME',
      apiUrl: 'https://gateway.acme.example/v1',
      enabled: true,
      managed: false,
      models: ['a', 'b'],
      selectedModels: ['a'],
    })
  })

  it('drops a row it could not key or match against a later answer', () => {
    expect(readProviderRow({ displayName: 'nameless' })).toBeUndefined()
    expect(readProviderRow('a provider')).toBeUndefined()
  })

  it('treats an unflagged row as managed, which is the read-only side', () => {
    expect(readProviderRow({ id: 'p_2' })?.managed).toBe(true)
    expect(readProviderRow({ id: 'p_2', managed: false })?.managed).toBe(false)
  })

  it('keeps only model ids it can actually name', () => {
    const row = readProviderRow({ id: 'p_3', models: ['a', 7, null], selectedModels: 'all' })
    expect(row?.models).toEqual(['a'])
    expect(row?.selectedModels).toEqual([])
  })
})

describe('reading one answer', () => {
  it('keeps signed-out and failed apart from an empty list', () => {
    expect(readProvidersResponse({ status: 'signed-out' })).toEqual({ status: 'signed-out' })
    expect(readProvidersResponse({ status: 'failed' })).toEqual({ status: 'failed' })
    expect(readProvidersResponse({ status: 'signed-in', providers: [] }))
      .toEqual({ status: 'ready', providers: [] })
  })

  it('refuses a body this build cannot read rather than reporting no providers', () => {
    expect(readProvidersResponse({ status: 'signed-in' })).toBeUndefined()
    expect(readProvidersResponse({ status: 'something-new' })).toBeUndefined()
    expect(readProvidersResponse(null)).toBeUndefined()
  })
})

describe('naming a refusal', () => {
  it('maps the product identifiers this section has a line for', () => {
    expect(failureFor('prefix_taken')).toBe('error.prefixExists')
    expect(failureFor('prefix_format')).toBe('error.prefixFormat')
    expect(failureFor('prefix_required')).toBe('error.prefixRequired')
    expect(failureFor('api_url_required')).toBe('error.fields')
    expect(failureFor('api_key_required')).toBe('error.fields')
    expect(failureFor('api_url_invalid')).toBe('error.url')
    expect(failureFor('api_url_too_long')).toBe('error.url')
    expect(failureFor('byo_provider_limit_reached')).toBe('error.limit')
    expect(failureFor('managed_provider_readonly')).toBe('error.managed')
    expect(failureFor('not_found')).toBe('error.notFound')
    expect(failureFor('delete_refused')).toBe('error.deleteFailed')
  })

  it('shows the generic failure for an identifier a newer product invents', () => {
    expect(failureFor('some_future_rule')).toBe('error.failed')
    expect(failureFor('')).toBe('error.failed')
  })
})

describe('the source', () => {
  it('opens on loading, before anything has been read', () => {
    const source = new ProviderSource(host([]).environment)
    expect(source.getSnapshot()).toEqual({ status: 'loading' })
  })

  it('publishes the list the host reported, once', async () => {
    const bench = host([{ status: 'signed-in', providers: [ROW] }])
    const source = new ProviderSource(bench.environment)
    const listener = vi.fn()
    source.subscribe(listener)

    await source.refresh()
    const first = source.getSnapshot()
    expect(first.status).toBe('ready')
    expect((first as Extract<ProvidersState, { status: 'ready' }>).providers).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(1)

    // A repeated reading keeps the standing reference, which is the uSES
    // contract the render machinery relies on.
    await source.refresh()
    expect(source.getSnapshot()).toBe(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports a failure, not an empty list, when the host will not answer', async () => {
    const source = new ProviderSource(host([{}], false).environment)
    await source.refresh()
    expect(source.getSnapshot()).toEqual({ status: 'failed' })
  })

  it('reports a failure when the request never resolves into a response', async () => {
    const source = new ProviderSource({ request: () => Promise.reject(new Error('offline')) })
    await source.refresh()
    expect(source.getSnapshot()).toEqual({ status: 'failed' })
  })

  it('reports a failure when the answer is not JSON this build can read', async () => {
    const source = new ProviderSource({
      request: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('not json')) } as Response),
    })
    await source.refresh()
    expect(source.getSnapshot()).toEqual({ status: 'failed' })
  })

  it('re-reads after a create instead of trusting the draft it submitted', async () => {
    const bench = host([
      { status: 'created', provider: ROW },
      { status: 'signed-in', providers: [{ ...ROW, displayName: 'Acme (as stored)' }] },
    ])
    const source = new ProviderSource(bench.environment)

    const outcome = await source.create({
      displayName: 'Acme', prefix: 'acme', apiUrl: 'https://x.example', apiKey: 'sk-typed',
    })

    expect(outcome).toEqual({ ok: true })
    expect(bench.calls[0]?.init?.method).toBe('POST')
    // The second call is the re-read; the state shows what the store holds,
    // not what the form submitted.
    expect(bench.calls[1]?.init).toBeUndefined()
    const state = source.getSnapshot() as Extract<ProvidersState, { status: 'ready' }>
    expect(state.providers[0]?.displayName).toBe('Acme (as stored)')
  })

  it('carries the typed credential towards the host, and never back', async () => {
    const bench = host([
      { status: 'created', provider: ROW },
      { status: 'signed-in', providers: [ROW] },
    ])
    const source = new ProviderSource(bench.environment)
    await source.create({
      displayName: 'Acme', prefix: 'ACME', apiUrl: 'https://x.example', apiKey: 'sk-typed',
    })

    expect(JSON.stringify(bench.calls[0]?.init?.body)).toContain('sk-typed')
    expect(JSON.stringify(source.getSnapshot())).not.toContain('sk-typed')
  })

  it("renders the host's refusal reason rather than a generic failure", async () => {
    const bench = host([{ status: 'refused', reason: 'prefix_taken' }])
    const source = new ProviderSource(bench.environment)
    const outcome = await source.create({
      displayName: 'Acme', prefix: 'ACME', apiUrl: 'https://x.example', apiKey: 'sk',
    })
    expect(outcome).toEqual({ ok: false, reason: 'error.prefixExists' })
    // A refusal is not a reason to re-read: nothing changed.
    expect(bench.calls).toHaveLength(1)
  })

  it('reports a failure for an answer that reached no verdict at all', async () => {
    for (const body of [{ status: 'signed-out' }, {}, null]) {
      const source = new ProviderSource(host([body]).environment)
      const outcome = await source.create({
        displayName: 'Acme', prefix: 'ACME', apiUrl: 'https://x.example', apiKey: 'sk',
      })
      expect(outcome).toEqual({ ok: false, reason: 'error.failed' })
    }
  })

  it('reports a failure when the create request never resolves', async () => {
    const source = new ProviderSource({ request: () => Promise.reject(new Error('offline')) })
    const outcome = await source.create({
      displayName: 'Acme', prefix: 'ACME', apiUrl: 'https://x.example', apiKey: 'sk',
    })
    expect(outcome).toEqual({ ok: false, reason: 'error.failed' })
  })

  it('stops publishing once disposed, so a read in flight lands nowhere', async () => {
    const bench = host([{ status: 'signed-in', providers: [ROW] }])
    const source = new ProviderSource(bench.environment)
    const listener = vi.fn()
    source.subscribe(listener)
    const reading = source.refresh()
    source.dispose()
    await reading

    expect(source.getSnapshot()).toEqual({ status: 'loading' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('re-reads after an edit instead of trusting the patch it submitted', async () => {
    const bench = host([
      { status: 'updated', provider: ROW },
      { status: 'signed-in', providers: [{ ...ROW, prefix: 'ACM2' }] },
    ])
    const source = new ProviderSource(bench.environment)

    const outcome = await source.update('p_1', { displayName: 'Renamed', prefix: 'acm2' })

    expect(outcome).toEqual({ ok: true })
    expect(bench.calls[0]?.path).toBe('/auth/providers/p_1')
    expect(bench.calls[0]?.init?.method).toBe('PATCH')
    const state = source.getSnapshot() as Extract<ProvidersState, { status: 'ready' }>
    expect(state.providers[0]?.prefix).toBe('ACM2')
  })

  it('addresses a row id that would otherwise change the path it is put in', async () => {
    const bench = host([{ status: 'updated', provider: ROW }, { status: 'signed-in', providers: [] }])
    await new ProviderSource(bench.environment).update('a/b?c', { enabled: false })
    expect(bench.calls[0]?.path).toBe('/auth/providers/a%2Fb%3Fc')
  })

  it('carries a newly typed credential towards the host, and never back', async () => {
    const bench = host([
      { status: 'updated', provider: ROW },
      { status: 'signed-in', providers: [ROW] },
    ])
    const source = new ProviderSource(bench.environment)
    await source.update('p_1', { apiKey: 'sk-retyped' })

    expect(JSON.stringify(bench.calls[0]?.init?.body)).toContain('sk-retyped')
    expect(JSON.stringify(source.getSnapshot())).not.toContain('sk-retyped')
  })

  it("names the product's managed-row refusal rather than a generic failure", async () => {
    const bench = host([{ status: 'refused', reason: 'managed_provider_readonly' }])
    const source = new ProviderSource(bench.environment)
    const outcome = await source.update('p_2', { prefix: 'NEW1' })

    expect(outcome).toEqual({ ok: false, reason: 'error.managed' })
    // A refusal is not a reason to re-read: nothing changed.
    expect(bench.calls).toHaveLength(1)
  })

  it('re-reads after a delete, and sends no body with it', async () => {
    const bench = host([{ status: 'deleted' }, { status: 'signed-in', providers: [] }])
    const source = new ProviderSource(bench.environment)

    const outcome = await source.remove('p_1')

    expect(outcome).toEqual({ ok: true })
    expect(bench.calls[0]?.init).toEqual({ method: 'DELETE' })
    expect(source.getSnapshot()).toEqual({ status: 'ready', providers: [] })
  })

  it('refuses to delete a managed row on the product\'s word', async () => {
    const bench = host([{ status: 'refused', reason: 'managed_provider_readonly' }])
    const outcome = await new ProviderSource(bench.environment).remove('p_2')
    expect(outcome).toEqual({ ok: false, reason: 'error.managed' })
  })

  it('reports a failure when a write reaches no verdict at all', async () => {
    for (const body of [{ status: 'signed-out' }, { status: 'deleted' }, {}, null]) {
      const source = new ProviderSource(host([body]).environment)
      expect(await source.update('p_1', { enabled: true })).toEqual({ ok: false, reason: 'error.failed' })
    }
    const offline = new ProviderSource({ request: () => Promise.reject(new Error('offline')) })
    expect(await offline.remove('p_1')).toEqual({ ok: false, reason: 'error.failed' })
  })

  it('drops one listener without dropping the others', async () => {
    const bench = host([{ status: 'signed-in', providers: [ROW] }])
    const source = new ProviderSource(bench.environment)
    const kept = vi.fn()
    const off = source.subscribe(vi.fn())
    source.subscribe(kept)
    off()
    await source.refresh()
    expect(kept).toHaveBeenCalledTimes(1)
  })
})
