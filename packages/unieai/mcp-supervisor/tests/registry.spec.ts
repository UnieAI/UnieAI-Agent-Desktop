/**
 * The two reconciliation decisions, stated without a Cordis tree: whether a
 * mounted instance still matches its grant, and when the next read is due.
 */
import { describe, expect, it } from 'vitest'
import type { McpServerGrant } from '@deepseek-ai/dsh-unieai-web-gate'
import { matchesGrant, nextRefreshDelay } from '../src/index.ts'
import type { MountedServer } from '../src/index.ts'

const NOW = Date.parse('2026-08-22T10:00:00.000Z')

const BOUNDS = { skewMs: 5 * 60 * 1000, minMs: 30 * 1000, maxMs: 30 * 60 * 1000 }

const grant = (over: Partial<McpServerGrant> = {}): McpServerGrant => ({
  id: 'unieai-studio',
  label: 'UnieAI Studio',
  url: 'https://product.test/api/agent-next/studio-mcp',
  token: 'bearer-1',
  expiresAt: '2026-08-22T11:00:00.000Z',
  tools: ['search'],
  ...over,
})

const mounted = (over: Partial<MountedServer> = {}): MountedServer => ({
  id: 'unieai-studio',
  url: 'https://product.test/api/agent-next/studio-mcp',
  token: 'bearer-1',
  expiresAt: '2026-08-22T11:00:00.000Z',
  dispose: () => Promise.resolve(),
  ...over,
})

describe('matchesGrant', () => {
  it('leaves an unchanged server mounted', () => {
    expect(matchesGrant(mounted(), grant())).toBe(true)
  })

  it('re-mounts on a fresh bearer, which is what a re-read always produces', () => {
    expect(matchesGrant(mounted(), grant({ token: 'bearer-2' }))).toBe(false)
  })

  it('re-mounts when the endpoint moved', () => {
    expect(matchesGrant(mounted(), grant({ url: 'https://elsewhere.test/mcp' }))).toBe(false)
  })

  it('re-mounts when only the expiry moved, so the deadline stays honest', () => {
    expect(matchesGrant(mounted(), grant({ expiresAt: '2026-08-22T12:00:00.000Z' }))).toBe(false)
  })
})

describe('nextRefreshDelay', () => {
  it('reads ahead of the earliest expiry by the skew', () => {
    const soon = grant({ expiresAt: '2026-08-22T10:20:00.000Z' })
    const delay = nextRefreshDelay([grant({ expiresAt: '2026-08-22T10:25:00.000Z' }), soon], NOW, BOUNDS)

    // 20 minutes to the earliest expiry, less the 5-minute skew. The later
    // grant does not get to decide: one lapsed bearer is enough to make a
    // mounted server fail silently.
    expect(delay).toBe(15 * 60 * 1000)
  })

  it('clamps an hour-long grant to the ceiling, which is what the product mints', () => {
    // The product's own lifetime is an hour, so the ceiling is what actually
    // paces the refresh in production; the skew only takes over once a
    // deployment raises it above the remaining lifetime.
    expect(nextRefreshDelay([grant()], NOW, BOUNDS)).toBe(BOUNDS.maxMs)
  })

  it('clamps to the ceiling for an expiry far away', () => {
    expect(nextRefreshDelay([grant({ expiresAt: '2026-08-23T10:00:00.000Z' })], NOW, BOUNDS)).toBe(BOUNDS.maxMs)
  })

  it('clamps to the floor for a grant that already lapsed', () => {
    expect(nextRefreshDelay([grant({ expiresAt: '2026-08-22T09:00:00.000Z' })], NOW, BOUNDS)).toBe(BOUNDS.minMs)
  })

  it('treats an unreadable expiry as due now rather than as never', () => {
    // A product build that reported no timestamp still handed out a token that
    // stops working; the only safe reading of an unknown lifetime is a short one.
    expect(nextRefreshDelay([grant({ expiresAt: '' })], NOW, BOUNDS)).toBe(BOUNDS.minMs)
  })

  it('paces the read at the ceiling when the account has connected nothing', () => {
    expect(nextRefreshDelay([], NOW, BOUNDS)).toBe(BOUNDS.maxMs)
  })
})
