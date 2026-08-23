// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { PluginDirectoryArea } from '../src/client/PluginDirectoryArea.tsx'
import type { PluginDirectoryAreaInjected } from '../src/client/PluginDirectoryArea.tsx'
import { en, ja, zh, zhTW } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { entries: [] }
type ListResult =
  | { readonly ok: true; readonly value: typeof EMPTY }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const list = vi.fn<() => Promise<ListResult>>()
    .mockResolvedValue({ ok: true, value: EMPTY })
  ctx.provide('remote.pluginInventory', { list })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'plugins.page.area': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-plugin-inventory browser plugin', () => {
  it('declares only the services used by the page contribution and its Remote', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginInventory'])
  })

  it('ships one complete dictionary per shipped locale', () => {
    const keys = Object.keys(zh).sort()
    for (const dictionary of [en, ja, zhTW]) {
      expect(Object.keys(dictionary).sort()).toEqual(keys)
    }
  })

  it('registers a page area without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('plugins.page.area')[0]!
    expect(entry.component).toBe(PluginDirectoryArea)
    expect(entry.options).toMatchObject({ id: 'plugin-directory', order: 5 })
    expect(entry.locale).toBe(NS)
    expect(b.list).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => PluginDirectoryAreaInjected)()
    await expect(injected.list()).resolves.toEqual(EMPTY)
    expect(b.list).toHaveBeenCalledOnce()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(injected.list()).rejects.toThrow('pluginInventory.list failed: REMOTE_ERROR: unavailable')
    await b.ctx.fiber.dispose()
  })

  it('follows locale and recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('plugins.page.area')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('plugins.page.area')).toHaveLength(1) })
    const t = b.locale.bind(NS)
    expect(t('title')).toBe(zh.title)
    b.locale.setLocale('en')
    expect(t('title')).toBe(en.title)
    b.locale.setLocale('zh-TW')
    expect(t('title')).toBe(zhTW.title)
    b.locale.setLocale('ja')
    expect(t('title')).toBe(ja.title)

    stop()
    expect(b.slots.entries('plugins.page.area')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('plugins.page.area')[0]?.component).toBe(PluginDirectoryArea)
    })

    await fiber.dispose()
    expect(b.slots.entries('plugins.page.area')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
