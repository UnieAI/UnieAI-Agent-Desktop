/**
 * ui-plugins-page browser half on a real SlotRegistry: dictionaries ride the
 * locale service, the surface waits for the frame's overlay layer and the
 * sidebar nav list, the surface hole opens for the areas that fill it, the nav
 * row and the surface share one open state and one toggle, the MCP list is
 * read when the surface is opened rather than at boot, and teardown empties
 * every slot (HMR safety).
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
import { PluginsPage, TAB_VIEWS, VIEWS } from '../src/client/PluginsPage.tsx'
import { PluginsNavRow } from '../src/client/PluginsNavRow.tsx'
import { SkillsArea, type SkillsAreaInjected } from '../src/client/SkillsArea.tsx'
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

  it('gives every area this package registers exactly one destination', async () => {
    // `plugins.page.area` carries no per-entry label, so the destination table
    // in PluginsPage names entry ids directly. An area registered without a
    // destination would simply never render; this is the gate that fails
    // instead.
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const listed = VIEWS.flatMap(view => [...view.entries])
    expect(new Set(listed).size).toBe(listed.length)
    for (const entry of b.slots.entries(AREA)) {
      expect(listed, `area '${String(entry.options.id)}' has no destination`)
        .toContain(entry.options.id)
    }
  })

  it('keeps configuration off the pill strip, where only browsable places stand', () => {
    expect([...TAB_VIEWS]).toEqual(['directory', 'skills'])
    expect(VIEWS.map(view => view.id)).toContain('manage')
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
    row.toggle()
    expect(page.hooks.page.getSnapshot()).toEqual({ open: true })
    expect(row.hooks.page.getSnapshot()).toEqual({ open: true })
    page.close()
    expect(row.hooks.page.getSnapshot()).toEqual({ open: false })
  })

  it('leaves by the same row that arrived, because the column stays visible', async () => {
    // The surface covers the main area only, so the row the reader pressed is
    // still under their pointer: pressing the place you are standing in is how
    // you leave it.
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const row = (entryOf(b.slots, NAV, 'plugins-page')!.inject as unknown as () => PluginsNavRowInjected)()

    row.toggle()
    expect(row.hooks.page.getSnapshot()).toEqual({ open: true })
    row.toggle()
    expect(row.hooks.page.getSnapshot()).toEqual({ open: false })
  })

  it('registers the skills area, bound to the deployment catalogue', async () => {
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = entryOf(b.slots, AREA, 'skills')
    expect(entry?.component).toBe(SkillsArea)
    const face = (entry!.inject as unknown as () => SkillsAreaInjected)()
    expect(typeof face.hooks.skills.getSnapshot).toBe('function')
    expect(typeof face.refresh).toBe('function')
  })

  it('says the catalogue is unavailable rather than holding the page pending', async () => {
    // The connection is read, never injected: a composition that mounts none
    // would otherwise leave this whole destination waiting forever, and a
    // page that never renders is worse than one that says what it cannot do.
    hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const face = (entryOf(b.slots, AREA, 'skills')!.inject as unknown as () => SkillsAreaInjected)()
    expect(face.available).toBe(b.ctx.get('connection') !== undefined)
  })

  it('gives the surface chrome one re-read that covers every source it owns', async () => {
    const sent = hostRoute({ status: 'signed-out' })
    const b = await bench()
    declareShell(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const page = (entryOf(b.slots, OVERLAY, 'plugins-page')!.inject as unknown as () => PluginsPageInjected)()

    page.refresh()
    expect(sent.map(one => one.path)).toEqual(['/auth/mcp', '/auth/plugins'])
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
    row.toggle()
    // Both of the surface's own reads fire on the same gesture: the directory
    // the reader came to browse, and what they already have connected.
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
