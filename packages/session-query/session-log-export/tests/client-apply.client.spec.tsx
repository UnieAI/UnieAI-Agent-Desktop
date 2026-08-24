import { Context } from '@unieai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import type { SessionId } from '@unieai/uad-client-runtime/client'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import type {} from '@unieai/uad-client-ui-layout/client'
import type {} from '@unieai/uad-client-ui-workspace/client'
import { SessionLogDownloadOverlay } from '../src/client/Dialog.tsx'
import { SessionLogDownloadRowAction } from '../src/client/RowMenuAction.tsx'
import { apply, inject } from '../src/client/index.ts'

const SID = 'session-export-apply' as SessionId
const ROW_MENU = 'sidebar.workspaces.session.menu.action'

afterEach(() => { vi.unstubAllGlobals() })

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      [ROW_MENU]: { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declaration = declare(slots)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, declaration, fiber }
}

describe('session-log-download browser plugin', () => {
  it('sits in the sidebar row menu and the frame overlay, and in no Session Header seat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const b = await bench()
    expect(inject).toEqual(['slots', 'locale'])
    expect(b.ctx.sessionLogDownload).toBeDefined()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)

    const row = b.slots.entries(ROW_MENU)[0]
    expect(row?.component).toBe(SessionLogDownloadRowAction)
    expect(row?.options).toMatchObject({ id: 'session-log-download' })
    const rowInjected = (row?.inject as unknown as () => import('../src/client/RowMenuAction.tsx').SessionLogDownloadRowActionInjected)()
    await rowInjected.request(SID)
    expect(b.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]?.status).toBe('error')

    const overlay = b.slots.entries('shell.overlay')[0]
    expect(overlay?.component).toBe(SessionLogDownloadOverlay)
    const overlayInjected = (overlay?.inject as unknown as () => import('../src/client/Dialog.tsx').SessionLogDownloadOverlayInjected)()
    overlayInjected.dismiss(SID)
    expect(b.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]?.open).toBe(false)

    await b.fiber.dispose()
    expect(b.slots.entries(ROW_MENU)).toHaveLength(0)
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
  })

  it('downloads only for an export execution acknowledged by this browser client', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetcher)
    const first = await bench()
    const second = await bench()

    first.ctx.emit('command/executed', SID, 'plan', { kind: 'success' })
    expect(fetcher).not.toHaveBeenCalled()
    first.ctx.emit('command/executed', SID, 'export', { kind: 'error', text: 'bad path' })
    expect(fetcher).not.toHaveBeenCalled()
    first.ctx.emit('command/executed', SID, 'export', { kind: 'success' })
    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledOnce()
      expect(first.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]?.status).toBe('error')
    })
    expect(second.ctx.sessionLogDownload.store.getSnapshot().bySession[SID]).toBeUndefined()

    await first.fiber.dispose()
    await second.fiber.dispose()
  })

  it('re-registers after the declaring browsing region collapses and returns', async () => {
    const b = await bench()
    b.declaration()
    expect(b.slots.entries(ROW_MENU)).toHaveLength(0)
    const redeclare = declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(ROW_MENU)[0]?.component).toBe(SessionLogDownloadRowAction)
    redeclare()
    await b.fiber.dispose()
  })
})
