/**
 * ui-plugins-page browser half on a real SlotRegistry: dictionaries ride the
 * locale service, the page waits for the frame's overlay layer and the sidebar
 * nav list, the page hole opens for the areas that fill it, the nav row and
 * the page share one open state, the MCP list is read when the page is opened
 * rather than at boot, and teardown empties every slot (HMR safety).
 *
 * The lane has no jsdom `window`, so a fresh LocaleRuntime opens on the
 * English fallback; the bench switches locale explicitly where it asserts copy.
 */
import { Context } from '@unieai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import InvariantRegistry from '@unieai/uad-invariants'
import * as PageInvariant from '@unieai/uad-client-ui-plugins-page/invariant'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { PluginsPage } from '../src/client/PluginsPage.tsx'
import { PluginsNavRow } from '../src/client/PluginsNavRow.tsx'
import { StudioMcpArea } from '../src/client/StudioMcpArea.tsx'
import type { PluginsNavRowInjected, PluginsPageInjected } from '../src/client/contract/slots.ts'
import type { StudioMcpAreaInjected } from '../src/client/StudioMcpArea.tsx'
import { en, ja, zh, zhTW } from '../src/client/locales.ts'

const OVERLAY = 'shell.overlay'
const NAV = 'sidebar.nav.action'
const AREA = 'plugins.page.area'

/** One recorded call to the stubbed global fetch. */
interface Sent { path: string; init: RequestInit | undefined }

/** Stand in for the host gate: answer `/auth/mcp` and record the asks. */
function hostRoute(body: unknown, status = 200): Sent[] {
  const sent: Sent[] = []
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    sent.push({ path, init })
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)
  })
  return sent
}

/** Stand in for the frame and the sidebar: declare both seats from root. */
function declareShell(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      [OVERLAY]: { kind: 'list', scope: 'root' },
      [NAV]: { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const slots = ctx.get('slots') as SlotRegistry
  return { ctx, slots, locale }
}

/** The registered entry in one slot, or undefined while the slot is empty. */
function entryOf(slots: SlotRegistry, slot: string, id: string) {
  return slots.entries(slot as never).find(candidate => candidate.options.id === id)
}

afterEach(() => { vi.unstubAllGlobals() })

describe('ui-plugins-page browser apply', () => {
  it('declares every service it binds, and no gate service', () => {
    // There is none to declare: the Studio MCP area reads a host ROUTE, and a
    // composition without that route renders its own line rather than leaving
    // the fiber pending forever.
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the invariant companion under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(PageInvariant).await()).resolves.toBeDefined()
  })

  it('ships one complete dictionary per shipped locale', () => {
    const keys = Object.keys(zh).sort()
    for (const dict of [en, zhTW, ja]) expect(Object.keys(dict).sort()).toEqual(keys)
  })

  it('waits until the frame declares the overlay layer', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(OVERLAY as never)).toHaveLength(0)

    declareShell(b.slots)
    await Promise.resolve()
    expect(entryOf(b.slots, OVERLAY, 'plugins-page')?.component).toBe(PluginsPage)
    expect(entryOf(b.slots, NAV, 'plugins-page')?.component).toBe(PluginsNavRow)
  })

  it('opens the page hole so an area can be registered into it', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.spec('plugins.page.area')).toEqual({ kind: 'list', scope: 'root' })
    expect(entryOf(b.slots, AREA, 'studio-mcp')?.component).toBe(StudioMcpArea)
  })

  it('puts Studio MCP above whatever else the page carries', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(entryOf(b.slots, AREA, 'studio-mcp')?.options.order).toBe(0)
  })

  it('keeps the sidebar seat the settings shell\'s Plugins row held', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(entryOf(b.slots, NAV, 'plugins-page')?.options.order).toBe(10)
  })

  it('shares one open state between the row that opens and the page that closes', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const row = (entryOf(b.slots, NAV, 'plugins-page')!.inject as unknown as () => PluginsNavRowInjected)()
    const page = (entryOf(b.slots, OVERLAY, 'plugins-page')!.inject as unknown as () => PluginsPageInjected)()

    expect(page.hooks.page.getSnapshot()).toEqual({ open: false })
    row.open()
    expect(page.hooks.page.getSnapshot()).toEqual({ open: true })
    expect(row.hooks.page.getSnapshot()).toEqual({ open: true })
    page.close()
    expect(row.hooks.page.getSnapshot()).toEqual({ open: false })
  })

  it('reads the gate route when the page opens, not at boot', async () => {
    const sent = hostRoute({ status: 'signed-in', servers: [] })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    await Promise.resolve()
    // A list that belongs to an account changes elsewhere; asking at startup
    // would show one answer for the whole life of the document.
    expect(sent).toHaveLength(0)

    const row = (entryOf(b.slots, NAV, 'plugins-page')!.inject as unknown as () => PluginsNavRowInjected)()
    row.open()
    // Both of the page's own reads fire on the same gesture: the directory the
    // reader came to browse, and what they already have connected.
    expect(sent.map(one => one.path)).toEqual(['/auth/mcp', '/auth/plugins'])

    const area = (entryOf(b.slots, AREA, 'studio-mcp')!.inject as unknown as () => StudioMcpAreaInjected)()
    await vi.waitFor(() => {
      expect(area.hooks.servers.getSnapshot()).toEqual({ status: 'ready', servers: [] })
    })
    area.refresh()
    // The MCP area's own re-read is a third ask, on top of the two the open
    // gesture made.
    await vi.waitFor(() => { expect(sent.map(one => one.path)).toEqual(['/auth/mcp', '/auth/plugins', '/auth/mcp']) })
  })

  it('offers the area a source and a re-read, and nothing that writes', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const area = (entryOf(b.slots, AREA, 'studio-mcp')!.inject as unknown as () => StudioMcpAreaInjected)()
    // No install, no connect, no delete: this desktop has no route for any of
    // them, and a control that cannot work must not be drawn.
    expect(Object.keys(area)).toEqual(['hooks', 'refresh'])
  })

  it('withdraws every registration and stops the source on teardown', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const area = (entryOf(b.slots, AREA, 'studio-mcp')!.inject as unknown as () => StudioMcpAreaInjected)()

    await fiber.dispose()
    expect(b.slots.entries(OVERLAY as never)).toHaveLength(0)
    expect(b.slots.entries(NAV as never)).toHaveLength(0)
    // A disposed source publishes nothing further, so a late answer cannot
    // move a page that is no longer composed.
    const listener = vi.fn()
    area.hooks.servers.subscribe(listener)
    await area.hooks.servers.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})
