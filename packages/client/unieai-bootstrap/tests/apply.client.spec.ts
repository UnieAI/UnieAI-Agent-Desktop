/**
 * The plugin body on a real cordis context.
 *
 * Two properties are the whole design and are asserted here rather than
 * described: the service exists BEFORE the read starts, so nothing waits on
 * this plugin's activation; and the plugin's own activation waits for the
 * read, which is what holds the application's mount back until the desktop
 * knows what it has.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as BootstrapInvariant from '@deepseek-ai/dsh-client-unieai-bootstrap/invariant'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject, BOOTSTRAP_SERVICE } from '../src/client/index.ts'
import type { UnieAiBootstrap } from '../src/client/index.ts'

const READY = {
  status: 'ready',
  parts: {
    account: { status: 'signed-in', snapshot: { user: { id: 'u_1' } } },
    providers: { status: 'signed-in', providers: [] },
    models: { status: 'signed-in', models: [] },
    mcp: { status: 'signed-in', servers: [] },
  },
  pending: [],
}

/**
 * Stand in for the browser.
 * @param answer - the body the host answers with.
 * @param hold - when given, the read settles only after this resolves.
 * @returns the paths requested.
 */
function browser(answer: unknown, hold?: Promise<void>) {
  const paths: string[] = []
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path)
    if (hold !== undefined) await hold
    return { ok: true, json: () => Promise.resolve(answer) } as Response
  })
  return { paths }
}

const startupOf = (ctx: Context): UnieAiBootstrap => {
  const service = ctx.get(BOOTSTRAP_SERVICE)
  if (service === undefined) throw new Error('no startup answer is provided')
  return service
}

afterEach(() => { vi.unstubAllGlobals() })

describe('unieai-bootstrap browser apply', () => {
  it('waits on nothing, because everything else waits on it', () => {
    expect(inject).toEqual([])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the invariant companion under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(BootstrapInvariant).await()).resolves.toBeDefined()
  })

  it('reads the startup route once and publishes what it says', async () => {
    const web = browser(READY)
    const ctx = new Context()
    await ctx.plugin({ inject: [...inject], apply }).await()

    expect(web.paths).toEqual(['/auth/bootstrap'])
    expect(startupOf(ctx).getSnapshot().status).toBe('ready')
  })

  it('hands the service out only once the read has settled, which is what orders its consumers', async () => {
    let release = (): void => {}
    const held = new Promise<void>((resolve) => { release = () => { resolve() } })
    const web = browser(READY, held)
    const ctx = new Context()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    // The read is in flight and the service is not readable yet: Cordis does
    // not hand out a service whose fiber is not active. A consumer that used
    // `ctx.get` here would find nothing, which is why consumers inject.
    expect(web.paths).toEqual(['/auth/bootstrap'])
    expect(ctx.get(BOOTSTRAP_SERVICE)).toBeUndefined()

    release()
    await fiber.await()
    expect(startupOf(ctx).getSnapshot().status).toBe('ready')
  })

  it('does not finish activating until the desktop knows what it has', async () => {
    let release = (): void => {}
    const held = new Promise<void>((resolve) => { release = () => { resolve() } })
    browser(READY, held)
    const ctx = new Context()
    let active = false

    const fiber = ctx.plugin({ inject: [...inject], apply })
    void fiber.await().then(() => { active = true })
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(active).toBe(false)

    release()
    await fiber.await()
    await Promise.resolve()
    expect(active).toBe(true)
  })

  it('activates anyway when the host cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network is down')))
    const ctx = new Context()

    await ctx.plugin({ inject: [...inject], apply }).await()

    expect(startupOf(ctx).getSnapshot().status).toBe('unavailable')
  })

  it('leaves nothing behind on teardown', async () => {
    browser(READY)
    const ctx = new Context()
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()

    await fiber.dispose()

    expect(ctx.get(BOOTSTRAP_SERVICE)).toBeUndefined()
  })
})
