/**
 * One turn all the way to the product's relay.
 *
 * Registering a route and offering a name are not the same as being able to
 * run it, and the difference is exactly what the owner is waiting on. This
 * suite stands a local server in for `POST {product}/api/desktop/v1/chat/completions`,
 * signs in, streams a turn through `ctx.llm`, and asserts what left this host:
 * the relay path, the session's API key as the bearer, and the ENTITLED value
 * as `model` — the value the relay resolves an upstream from and bills the
 * account against.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import LlmRuntime from '@unieai/uad-llm'
import type { EntitledModel, UnieaiGate, UnieaiGateSession } from '@unieai/uad-unieai-web-gate'
import * as LlmUnieaiCloud from '../src/index.ts'

const API_KEY = 'sk-desktop-super-secret'
const ROUTE = 'unieai'

const MODEL: EntitledModel = {
  value: 'ACME-acme-large',
  label: 'acme-large',
  source: 'personal',
  prefix: 'ACME',
  providerName: 'Acme',
  groupName: '',
  acceptsImages: false,
  modelType: 'base_model',
  agentHarness: 'none',
}

/** A complete text generation in the chat-completions shape the relay proxies. */
const EVENTS = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]

/** What one request to the stand-in relay carried. */
interface Received {
  path: string
  authorization: string | undefined
  body: Record<string, unknown>
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

/** Stand in for the product's desktop relay on a loopback port. */
async function relay(): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = []
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      received.push({
        path: request.url ?? '',
        authorization: request.headers.authorization,
        body: JSON.parse(body) as Record<string, unknown>,
      })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const event of EVENTS) response.write(`data: ${event}\n\n`)
      response.end()
    })
  })
  cleanups.push(() => new Promise<void>((resolve) => { server.close(() => { resolve() }) }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { url: `http://127.0.0.1:${String(address.port)}`, received }
}

/** The sign-in gate, holding one session against the stand-in product. */
function gateOver(productUrl: string): UnieaiGate {
  const session: UnieaiGateSession = { userId: 'u_1', apiKey: API_KEY }
  return {
    productUrl,
    session: () => session,
    mcpServers: () => Promise.resolve(undefined),
    entitledModels: () => Promise.resolve([MODEL]),
  }
}

describe('a turn through the account\'s inference relay', () => {
  it('sends the entitled value and the session key to the relay path', async () => {
    const product = await relay()
    const ctx = new Context()
    cleanups.push(async () => { await ctx.fiber.dispose() })
    await ctx.plugin(LlmRuntime)
    ctx.provide('unieaiGate', gateOver(product.url))
    await ctx.plugin(LlmUnieaiCloud, {
      provider: ROUTE,
      displayName: 'UnieAI',
      defaultContextWindow: 131_072,
      defaultMaxTokens: 16_384,
      catalogRefreshMs: 60_000,
    })
    await new Promise(resolve => setTimeout(resolve, 20))

    const text: string[] = []
    for await (const chunk of ctx.llm.stream({
      provider: ROUTE,
      model: MODEL.value,
      messages: [],
    })) {
      if (chunk.type === 'text-delta') text.push(chunk.text)
    }

    expect(text.join('')).toBe('hello')
    expect(product.received).toHaveLength(1)
    const sent = product.received[0]!
    expect(sent.path).toBe('/api/desktop/v1/chat/completions')
    // The gate session's API key, spent by this host and never handed to a
    // page — the whole reason the relay exists.
    expect(sent.authorization).toBe(`Bearer ${API_KEY}`)
    // The entitled value, not the bare model id: `lib/desktop/inference.ts`
    // resolves the upstream from this and meters the turn against it.
    expect(sent.body['model']).toBe('ACME-acme-large')
  })
})
