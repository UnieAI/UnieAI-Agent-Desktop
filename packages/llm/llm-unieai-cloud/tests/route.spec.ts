/**
 * The cloud route in a real `llm` registry.
 *
 * The one property this suite exists for is `credentialReady`. `buildModelCatalog`
 * drops a whole route only on a DEFINITE `false`, so the difference between
 * "signed out" and "cannot tell" is the difference between a desktop that
 * offers no cloud models and one that offers a menu of names failing the
 * moment they are chosen. Everything else here — the endpoint, the model ids —
 * is what makes the models runnable once that answer is `true`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import LlmRuntime from '@unieai/uad-llm'
import type { EntitledModel, UnieaiGate, UnieaiGateSession } from '@unieai/uad-unieai-web-gate'
import * as LlmUnieaiCloud from '../src/index.ts'

const PRODUCT = 'https://product.test'
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

const VISION: EntitledModel = { ...MODEL, value: 'ACME-acme-vision', label: 'acme-vision', acceptsImages: true }

/** A gate this suite drives by hand, standing in for the real sign-in gate. */
function fakeGate() {
  let session: UnieaiGateSession | undefined
  let models: EntitledModel[] | undefined = [MODEL]
  const service: UnieaiGate = {
    productUrl: PRODUCT,
    session: () => session,
    mcpServers: () => Promise.resolve(undefined),
    entitledModels: () => Promise.resolve(session === undefined ? undefined : models),
    // This suite drives the relay, not the skill catalogue; the seam is
    // satisfied with the answer a signed-out gate gives.
    accountSkill: async () => undefined,
  }
  return {
    service,
    signIn: () => { session = { userId: 'u_1', apiKey: 'sk-desktop' } },
    signOut: () => { session = undefined },
    serve: (next: EntitledModel[] | undefined) => { models = next },
  }
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

/**
 * Boot a real llm registry with the cloud route over a hand-driven gate.
 * @param signedIn - whether a session already exists when the plugin mounts.
 * @returns the context, the gate handle, and the plugin's fiber.
 */
async function boot(signedIn: boolean) {
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(LlmRuntime)
  const gate = fakeGate()
  if (signedIn) gate.signIn()
  ctx.provide('unieaiGate', gate.service)
  const fiber = ctx.plugin(LlmUnieaiCloud, {
    provider: ROUTE,
    displayName: 'UnieAI',
    defaultContextWindow: 131_072,
    defaultMaxTokens: 16_384,
    catalogRefreshMs: 60_000,
  })
  await fiber.await()
  return { ctx, gate, fiber }
}

/** Wait until the catalog read that `apply` starts has settled. */
const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 20)) }

describe('the UnieAI cloud route', () => {
  it('registers nothing before the first sign-in, so no name is offered', async () => {
    const { ctx } = await boot(false)
    await settle()

    expect(ctx.llm.listProviders()).toEqual([])
  })

  it('registers the account\'s entitled models once a session exists', async () => {
    const { ctx } = await boot(true)
    await settle()

    expect(ctx.llm.listProviders()).toEqual([{ id: ROUTE, name: 'UnieAI' }])
    const models = await ctx.llm.listModels(ROUTE)
    expect(models.map(model => model.id)).toEqual(['ACME-acme-large'])
    // The entitled value, not the bare model id: that is what the relay
    // resolves an upstream from and what the account is billed against.
    expect(models[0]?.name).toBe('acme-large')
  })

  it('answers credentialReady true while a session exists', async () => {
    const { ctx } = await boot(true)
    await settle()

    expect(await ctx.llm.credentialReady(ROUTE)).toBe(true)
  })

  it('answers credentialReady a definite false once signed out', async () => {
    const { ctx, gate } = await boot(true)
    await settle()
    expect(await ctx.llm.credentialReady(ROUTE)).toBe(true)

    gate.signOut()
    ctx.emit('unieai-gate/session', undefined)
    await settle()

    // `false`, not `undefined`: only a definite false takes the route out of
    // every model catalog, and whether this host holds a session is something
    // it knows for certain.
    expect(await ctx.llm.credentialReady(ROUTE)).toBe(false)
    // The route itself stays registered. Withdrawing it would make the adapter
    // answer "not mine" — an unknown — which is deliberately not enough to
    // hide anything.
    expect(ctx.llm.listProviders()).toEqual([{ id: ROUTE, name: 'UnieAI' }])
  })

  it('picks the catalog up on a sign-in that happens after mounting', async () => {
    const { ctx, gate } = await boot(false)
    await settle()

    gate.signIn()
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await settle()

    expect(await ctx.llm.credentialReady(ROUTE)).toBe(true)
    expect((await ctx.llm.listModels(ROUTE)).map(model => model.id)).toEqual(['ACME-acme-large'])
  })

  it('keeps the previous catalog when the entitlement list cannot be read', async () => {
    const { ctx, gate } = await boot(true)
    await settle()

    gate.serve(undefined)
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await settle()

    expect((await ctx.llm.listModels(ROUTE)).map(model => model.id)).toEqual(['ACME-acme-large'])
  })

  it('declares image input only for a model the product says accepts it', async () => {
    const { ctx, gate } = await boot(true)
    await settle()

    gate.serve([MODEL, VISION])
    ctx.emit('unieai-gate/session', { userId: 'u_1', apiKey: 'sk-desktop' })
    await settle()

    const models = await ctx.llm.listModels(ROUTE)
    expect(models.find(model => model.id === 'ACME-acme-large')?.inputModalities).toEqual(['text'])
    expect(models.find(model => model.id === 'ACME-acme-vision')?.inputModalities).toEqual(['text', 'image'])
  })

  it('releases the route when the fiber is disposed', async () => {
    const { ctx, fiber } = await boot(true)
    await settle()
    expect(ctx.llm.listProviders()).toHaveLength(1)

    await fiber.dispose()

    expect(ctx.llm.listProviders()).toEqual([])
  })
})

describe('buildRouteProfiles', () => {
  it('points every model at the product\'s desktop relay', () => {
    const profiles = LlmUnieaiCloud.buildRouteProfiles([MODEL], {
      provider: ROUTE,
      displayName: 'UnieAI',
      productUrl: PRODUCT,
      defaultContextWindow: 131_072,
      defaultMaxTokens: 16_384,
    })

    expect(profiles?.get(ROUTE)?.baseURL).toBe(LlmUnieaiCloud.relayBaseUrl(PRODUCT))
    expect(LlmUnieaiCloud.relayBaseUrl(PRODUCT)).toBe(`${PRODUCT}/api/desktop/v1`)
  })

  it('names no credential reference, because the credential is a session', () => {
    const profiles = LlmUnieaiCloud.buildRouteProfiles([MODEL], {
      provider: ROUTE,
      displayName: 'UnieAI',
      productUrl: PRODUCT,
      defaultContextWindow: 131_072,
      defaultMaxTokens: 16_384,
    })

    // A reference would mean a name in the durable credential store; the gate
    // session's API key is minted per sign-in and held in memory only.
    expect(profiles?.get(ROUTE)?.apiKeyEnv).toBeUndefined()
  })

  it('builds no route at all for an account entitled to nothing', () => {
    expect(LlmUnieaiCloud.buildRouteProfiles([], {
      provider: ROUTE,
      displayName: 'UnieAI',
      productUrl: PRODUCT,
      defaultContextWindow: 131_072,
      defaultMaxTokens: 16_384,
    })).toBeUndefined()
  })
})
