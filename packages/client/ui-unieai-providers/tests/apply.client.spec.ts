/**
 * ui-unieai-providers browser half on a real SlotRegistry: dictionaries ride
 * the locale service, the section registers into the settings-shell slot only
 * once that slot is declared, the nav label follows the active locale, the
 * injected face carries the one source plus the four gestures the page offers,
 * and teardown empties the slot (HMR safety).
 *
 * The lane has no jsdom `window`, so a fresh LocaleRuntime opens on the
 * English fallback; the bench switches locale explicitly where it asserts copy.
 */
import { Context } from '@unieai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import InvariantRegistry from '@unieai/uad-invariants'
import * as ProvidersInvariant from '@unieai/uad-client-ui-unieai-providers/invariant'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { ProvidersSection } from '../src/client/ProvidersSection.tsx'
import type { ProvidersSectionInjected } from '../src/client/ProvidersSection.tsx'
import { en, ja, zh, zhTW } from '../src/client/locales.ts'

const SLOT = 'settings.section'

/** One recorded call to the stubbed global fetch. */
interface Sent { path: string; init: RequestInit | undefined }

/** Stand in for the host gate: answer `/auth/providers` and record the asks. */
function hostRoute(body: unknown, ok = true): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    sent.push({ path, init })
    return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
  })
  return sent
}

/** Stand in for the settings shell: declare the section slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const slots = ctx.get('slots') as SlotRegistry
  return { ctx, slots, locale }
}

/** The registered section entry, or undefined while the slot is empty. */
function entryOf(slots: SlotRegistry) {
  return slots.entries(SLOT).find(candidate => candidate.options.id === 'unieai-providers')
}

afterEach(() => { vi.unstubAllGlobals() })

describe('ui-unieai-providers browser apply', () => {
  it('declares every service it binds, and no gate service', () => {
    // There is none to declare: the section reads a host ROUTE, and a
    // composition without that route renders the failure line rather than
    // leaving the fiber pending forever.
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the invariant companion under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(ProvidersInvariant).await()).resolves.toBeDefined()
  })

  it('ships one complete dictionary per shipped locale', () => {
    const keys = Object.keys(zh).sort()
    for (const dict of [en, zhTW, ja]) expect(Object.keys(dict).sort()).toEqual(keys)
  })

  it('waits until the settings shell declares the section slot', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareSections(b.slots)
    await Promise.resolve()
    expect(entryOf(b.slots)?.component).toBe(ProvidersSection)
  })

  it('sits after the Models page, which is the desktop\'s own provider surface', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(entryOf(b.slots)?.options.order).toBeGreaterThan(10)
  })

  it('labels the nav row from the active locale', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const label = entryOf(b.slots)?.options.label as () => string
    expect(label()).toBe(en['nav'])
    b.locale.setLocale('ja')
    expect(label()).toBe(ja['nav'])
  })

  it('reads the gate route once on apply, and again on demand', async () => {
    const sent = hostRoute({ status: 'signed-in', providers: [] })
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await Promise.resolve()

    expect(sent.map(one => one.path)).toEqual(['/auth/providers'])
    const injected = (entryOf(b.slots)!.inject as unknown as () => ProvidersSectionInjected)()
    await vi.waitFor(() => {
      expect(injected.hooks.providers.getSnapshot()).toEqual({ status: 'ready', providers: [] })
    })

    injected.refresh()
    await vi.waitFor(() => { expect(sent).toHaveLength(2) })
  })

  it('offers exactly the source and the four gestures this page can perform', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (entryOf(b.slots)!.inject as unknown as () => ProvidersSectionInjected)()
    expect(Object.keys(injected)).toEqual(['hooks', 'refresh', 'create', 'update', 'remove'])
  })

  it('withdraws the section and stops the source on teardown', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareSections(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const injected = (entryOf(b.slots)!.inject as unknown as () => ProvidersSectionInjected)()

    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    // A disposed source publishes nothing further, so a late answer cannot
    // move a page that is no longer composed.
    const listener = vi.fn()
    injected.hooks.providers.subscribe(listener)
    await injected.hooks.providers.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})
