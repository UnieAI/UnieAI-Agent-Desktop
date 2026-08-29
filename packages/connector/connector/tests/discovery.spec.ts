// What the seam reads from a provider, and what it refuses. Every case here is
// a silent failure if it goes the other way: a connector that cannot protect
// its code exchange, one whose endpoints went stale, or one that says "not
// connected" when what it means is "nobody registered an application".

import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverServer, resolveEndpoints } from '../src/index.ts'
import { REGISTERED, SELF_REGISTERING, SHIPPED } from '../src/index.ts'
import type { ConnectorProvider } from '../src/index.ts'

const live = new AbortController().signal

/** Answer one fetch with a metadata document. */
function serving(document: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve(document),
  } as Response)))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('reading a server’s own metadata', () => {
  it('takes the endpoints the server publishes, not ones written down here', async () => {
    serving({
      authorization_endpoint: 'https://x.test/a',
      token_endpoint: 'https://x.test/t',
      registration_endpoint: 'https://x.test/r',
      code_challenge_methods_supported: ['S256'],
    })
    const metadata = await discoverServer('https://x.test', live)
    expect(metadata.authorization_endpoint).toBe('https://x.test/a')
    expect(metadata.registration_endpoint).toBe('https://x.test/r')
  })

  it('refuses a server that will not accept S256, which a program with no secret depends on', async () => {
    serving({
      authorization_endpoint: 'https://x.test/a',
      token_endpoint: 'https://x.test/t',
      code_challenge_methods_supported: ['plain'],
    })
    await expect(discoverServer('https://x.test', live)).rejects.toThrow(/S256/u)
  })

  it('refuses a document missing an endpoint rather than building a half URL', async () => {
    serving({ authorization_endpoint: 'https://x.test/a' })
    await expect(discoverServer('https://x.test', live)).rejects.toThrow(/endpoints/u)
  })

  it('says so when the server publishes nothing', async () => {
    serving({}, false)
    await expect(discoverServer('https://x.test', live)).rejects.toThrow(/no authorization-server metadata/u)
  })
})

describe('resolving a provider’s endpoints', () => {
  it('uses what a written-out provider states, without asking the network', async () => {
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)
    const google = REGISTERED.find(p => p.id === 'google') as ConnectorProvider
    const endpoints = await resolveEndpoints(google, live)
    expect(endpoints.tokenUrl).toBe('https://oauth2.googleapis.com/token')
    // Google issues no refresh token without both of these, and a connection
    // that dies at the first expiry looks like a bug in this program.
    expect(endpoints.authorizationParams).toEqual({ access_type: 'offline', prompt: 'consent' })
    expect(endpoints.registrationUrl).toBeUndefined()
    expect(fetched).not.toHaveBeenCalled()
  })

  it('reads a discovered provider, and carries the registration endpoint through', async () => {
    serving({
      authorization_endpoint: 'https://mcp.test/authorize',
      token_endpoint: 'https://mcp.test/token',
      registration_endpoint: 'https://mcp.test/register',
      code_challenge_methods_supported: ['S256'],
    })
    const notion = SELF_REGISTERING.find(p => p.id === 'notion') as ConnectorProvider
    const endpoints = await resolveEndpoints(notion, live)
    expect(endpoints.registrationUrl).toBe('https://mcp.test/register')
  })
})

describe('the shipped catalogue', () => {
  it('offers every connector under its own id', () => {
    expect(new Set(SHIPPED.map(p => p.id)).size).toBe(SHIPPED.length)
  })

  it('lists the ones that work on a fresh install first', () => {
    // Order is what a person sees, and the ones needing no setup are the ones
    // they can actually use today.
    expect(SHIPPED.slice(0, SELF_REGISTERING.length)).toEqual(SELF_REGISTERING)
  })

  it('asks Microsoft for offline access, because it has no access_type parameter', () => {
    const microsoft = REGISTERED.find(p => p.id === 'microsoft') as ConnectorProvider
    expect(microsoft.scopes).toContain('offline_access')
  })

  it('asks Google for no restricted scope, which is what avoids an annual security assessment', () => {
    const google = REGISTERED.find(p => p.id === 'google') as ConnectorProvider
    expect(google.scopes).not.toContain('https://www.googleapis.com/auth/drive')
    expect(google.scopes.some(s => s.includes('gmail'))).toBe(false)
    expect(google.scopes).toContain('https://www.googleapis.com/auth/drive.file')
  })
})
