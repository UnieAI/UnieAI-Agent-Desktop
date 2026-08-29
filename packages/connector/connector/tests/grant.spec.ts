// The rules a connector grant is read by. Each one exists because getting it
// wrong is silent: a token handed to the wrong service, a connection that looks
// alive until the first call, or a refresh that never happens.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { accountOf, connectorKey, createPkce, expiryFrom, grantOf, isFresh } from '../src/index.ts'
import type { ConnectorGrant } from '../src/index.ts'

const grant = (over: Partial<ConnectorGrant> = {}): ConnectorGrant => ({
  provider: 'google',
  accessToken: 'at',
  expiresAt: '2999-01-01T00:00:00.000Z',
  scopes: ['openid'],
  ...over,
})

describe('PKCE', () => {
  it('sends the digest and keeps the verifier, which is the whole of a public client’s security', () => {
    const pair = createPkce()
    expect(pair.verifier).not.toBe(pair.challenge)
    expect(createHash('sha256').update(pair.verifier).digest('base64url')).toBe(pair.challenge)
  })

  it('never repeats', () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier)
  })
})

describe('reading a stored grant', () => {
  it('refuses a record filed under another provider, which would hand one service another’s token', () => {
    expect(grantOf({ kind: 'grant', payload: grant({ provider: 'microsoft' }) }, 'google')).toBeUndefined()
  })

  it('refuses an api-key record, whatever it holds', () => {
    expect(grantOf({ kind: 'api-key', value: 'k' } as never, 'google')).toBeUndefined()
  })

  it('refuses a payload missing the two fields every caller reads', () => {
    expect(grantOf({ kind: 'grant', payload: { provider: 'google' } }, 'google')).toBeUndefined()
    expect(grantOf({ kind: 'grant', payload: null }, 'google')).toBeUndefined()
  })

  it('reads one that matches', () => {
    expect(grantOf({ kind: 'grant', payload: grant() }, 'google')?.accessToken).toBe('at')
  })
})

describe('freshness', () => {
  it('is measured against the stored expiry', () => {
    expect(isFresh(grant({ expiresAt: '2026-01-01T00:00:00.000Z' }), new Date('2025-12-31T23:59:00Z'))).toBe(true)
    expect(isFresh(grant({ expiresAt: '2026-01-01T00:00:00.000Z' }), new Date('2026-01-01T00:00:01Z'))).toBe(false)
  })

  it('takes a minute off the provider’s figure, because a token that expires in flight fails the call', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(expiryFrom(3600, now)).toBe('2026-01-01T00:59:00.000Z')
  })

  it('never lands before now, however small the window the provider gave', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    expect(expiryFrom(10, now)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('assumes an hour when the provider states no lifetime', () => {
    expect(expiryFrom(undefined, new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:59:00.000Z')
  })
})

describe('the account label', () => {
  const token = (claims: unknown): string =>
    `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`

  it('prefers the email a person would recognize', () => {
    expect(accountOf(token({ email: 'roy@example.com', sub: '1234' }))).toBe('roy@example.com')
  })

  it('falls back to the subject when no email was claimed', () => {
    expect(accountOf(token({ sub: '1234' }))).toBe('1234')
  })

  it('is absent rather than wrong when the token cannot be read', () => {
    expect(accountOf(undefined)).toBeUndefined()
    expect(accountOf('not-a-token')).toBeUndefined()
    expect(accountOf('x.@@@.y')).toBeUndefined()
  })
})

describe('where a grant is filed', () => {
  it('is one record per provider, under the connector scope', () => {
    expect(connectorKey('google')).not.toBe(connectorKey('microsoft'))
    expect(String(connectorKey('google'))).toContain('google')
  })
})
