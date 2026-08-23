/**
 * The supervisor against a stubbed MCP SDK and a stubbed sign-in gate.
 *
 * Three things are worth proving here and nothing else in the repository
 * proves them:
 *
 * - a signed-out desktop mounts nothing, and signing out releases what was
 *   mounted;
 * - a grant that is about to expire is re-read and re-mounted with the new
 *   bearer BEFORE it lapses, because a mounted server whose bearer lapsed
 *   fails every call with no other signal; and
 * - disposing the fiber empties the registry — the tools the mounted instances
 *   contributed are gone from `ctx.tools`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@unieai/cordis'
import SystemPrompt from '@unieai/uad-system-prompt'
import ToolRuntime from '@unieai/uad-tools'
import type { McpServerGrant, UnieaiGate, UnieaiGateSession } from '@unieai/uad-unieai-web-gate'

// The mock class and functions must exist when the hoisted vi.mock factories
// run, which is before every import above.
const { mockConnect, mockClose, mockListTools, MockClient, MockStreamableTransport, transportCalls } = vi.hoisted(() => {
  const mockConnect = vi.fn<() => Promise<void>>()
  const mockClose = vi.fn<() => Promise<void>>()
  const mockListTools = vi.fn<(params?: Record<string, unknown>) => Promise<unknown>>()
  const mockRequest = vi.fn(async (request: { method: string; params?: Record<string, unknown> }): Promise<unknown> => {
    if (request.method === 'tools/list') return await mockListTools(request.params)
    throw new Error(`unexpected MCP request: ${request.method}`)
  })
  class MockClient {
    connect = mockConnect
    close = mockClose
    listTools = mockListTools
    request = mockRequest
    setNotificationHandler = vi.fn()
  }
  const transportCalls: Array<{ url: string; headers: Record<string, string> }> = []
  // A function expression, not an arrow: the transport is constructed with
  // `new`, which an arrow function cannot be.
  const MockStreamableTransport = vi.fn(function (
    url: URL,
    init?: { requestInit?: { headers?: Record<string, string> } },
  ) {
    transportCalls.push({ url: url.toString(), headers: init?.requestInit?.headers ?? {} })
  })
  return { mockConnect, mockClose, mockListTools, MockClient, MockStreamableTransport, transportCalls }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: MockClient }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: MockStreamableTransport,
}))

import { apply, Config, inject, name } from '../src/index.ts'

const PRODUCT = 'https://product.test'
const STUDIO = 'unieai-studio'

/**
 * One grant, minted at `mintedAt` and good for an hour — the product's own
 * lifetime for these bearers.
 * @param mintedAt - epoch milliseconds the grant was minted at.
 * @returns the grant.
 */
function grant(mintedAt: number): McpServerGrant {
  return {
    id: STUDIO,
    label: 'UnieAI Studio',
    url: `${PRODUCT}/api/agent-next/studio-mcp`,
    token: `bearer-${String(mintedAt)}`,
    expiresAt: new Date(mintedAt + 60 * 60 * 1000).toISOString(),
    tools: ['search'],
  }
}

/** A gate this suite drives by hand, standing in for the real sign-in gate. */
function fakeGate() {
  let session: UnieaiGateSession | undefined
  let servers: McpServerGrant[] | undefined = [grant(Date.now())]
  let reads = 0
  const service: UnieaiGate = {
    productUrl: PRODUCT,
    session: () => session,
    mcpServers: () => {
      reads += 1
      return Promise.resolve(session === undefined ? undefined : servers)
    },
    entitledModels: () => Promise.resolve(undefined),
  }
  return {
    service,
    reads: () => reads,
    signIn: () => { session = { userId: 'u_1', apiKey: 'sk-desktop' } },
    signOut: () => { session = undefined },
    serve: (next: McpServerGrant[] | undefined) => { servers = next },
  }
}

/** One mounted supervisor over a real tool registry. */
async function bench(overrides: Partial<Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const gate = fakeGate()
  ctx.provide('unieaiGate', gate.service)
  const fiber = ctx.plugin({ name, inject, apply, Config }, {
    // Short waits so a refresh cycle is observable without fake timers, which
    // cannot be used here: the reconciliation awaits real plugin fibers.
    refreshSkewMs: 60 * 60 * 1000 - 20,
    minRefreshMs: 5,
    maxRefreshMs: 50,
    retryDelayMs: 5,
    toolCallTimeoutMs: 1000,
    ...overrides,
  })
  await fiber.await()
  return { ctx, gate, fiber }
}

beforeEach(() => {
  vi.clearAllMocks()
  transportCalls.length = 0
  mockConnect.mockResolvedValue(undefined)
  mockClose.mockImplementation(function (this: { onclose?: () => void }) {
    this.onclose?.()
    return Promise.resolve()
  })
  mockListTools.mockResolvedValue({
    tools: [{ name: 'search', description: 'Search the knowledge base', inputSchema: { type: 'object' } }],
    nextCursor: undefined,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the account\'s MCP servers', () => {
  it('mounts nothing while nobody is signed in, and does not even ask the product', async () => {
    const { ctx, fiber, gate } = await bench()

    // Long enough for several refresh cycles at this bench's 5ms floor, so
    // this is the absence of an attempt rather than a race with the first one.
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(gate.reads()).toBe(0)
    expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeUndefined()
    expect(transportCalls).toEqual([])
    await fiber.dispose()
  })

  it('mounts one instance per granted server once a session exists', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })

    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    expect(transportCalls[0]?.headers['authorization']).toMatch(/^Bearer bearer-/)
    await fiber.dispose()
  })

  it('skips a server whose id could not be a tool namespace', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.serve([{ ...grant(Date.now()), id: 'not a namespace!' }])
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })

    await vi.waitFor(() => { expect(gate.reads()).toBeGreaterThan(1) })
    expect(transportCalls).toEqual([])
    await fiber.dispose()
  })

  it('re-reads and re-mounts with the fresh bearer before the grant expires', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    const first = transportCalls[0]?.headers['authorization']

    // The product mints a new bearer on every read, which is exactly the case
    // the supervisor must notice: nothing else about the server changed.
    gate.serve([grant(Date.now() + 1)])

    await vi.waitFor(() => {
      expect(transportCalls.length).toBeGreaterThan(1)
      expect(transportCalls.at(-1)?.headers['authorization']).not.toBe(first)
    })
    // The tools survive the swap: the namespace was freed before it was taken
    // again, so the re-mount does not collide with the instance it replaces.
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    await fiber.dispose()
  })

  it('leaves a mounted server alone while its grant is unchanged', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    const mounts = transportCalls.length
    const reads = gate.reads()

    await vi.waitFor(() => { expect(gate.reads()).toBeGreaterThan(reads + 1) })
    expect(transportCalls.length).toBe(mounts)
    await fiber.dispose()
  })

  it('keeps what is mounted when the product cannot be read', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    const reads = gate.reads()

    gate.serve(undefined)
    await vi.waitFor(() => { expect(gate.reads()).toBeGreaterThan(reads + 1) })

    // A momentary outage on the product must not cost the account every tool:
    // the instances keep working until their grants actually lapse.
    expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined()
    await fiber.dispose()
  })

  it('releases every instance when the last session goes', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })

    gate.signOut()
    ctx.emit('unieai-gate/session', undefined)

    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeUndefined() })
    await fiber.dispose()
  })

  it('empties the registry when the fiber is disposed', async () => {
    const { ctx, fiber, gate } = await bench()
    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })

    await fiber.dispose()

    expect(ctx.tools.get(`mcp__${STUDIO}__search`)).toBeUndefined()
    // A second mount reproduces the identical tool name, which is what makes
    // the namespace reservation observably released rather than merely
    // forgotten.
    const again = await bench()
    again.gate.signIn()
    again.ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await vi.waitFor(() => { expect(again.ctx.tools.get(`mcp__${STUDIO}__search`)).toBeDefined() })
    await again.fiber.dispose()
  })
})
