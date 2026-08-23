// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginDirectoryArea } from '../src/client/PluginDirectoryArea.tsx'
import type {
  PluginDirectoryAreaInjected,
  PluginDirectoryAreaProps,
} from '../src/client/PluginDirectoryArea.tsx'
import { en, type PluginInventoryLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginDirectoryAreaInjected['list']>>
const t = ((key: PluginInventoryLocaleKey): string => en[key]) as PluginDirectoryAreaProps['t']

function props(list: PluginDirectoryAreaInjected['list']): PluginDirectoryAreaProps {
  return { t, list } as PluginDirectoryAreaProps
}

const SNAPSHOT = {
  entries: [
    { entryId: '8a1b2c3d', moduleName: '@unieai/cordis-plugin-hmr', enabled: true, fiberPhase: 'active' },
    { entryId: 'pending', moduleName: 'cordis:pending-name', enabled: true, fiberPhase: 'pending' },
    { entryId: 'loading', moduleName: '@fixture/loading-name', enabled: true, fiberPhase: 'loading' },
    { entryId: 'failed', moduleName: '@fixture/failed-name', enabled: true, fiberPhase: 'failed' },
    { entryId: 'unloading', moduleName: '@fixture/unloading-name', enabled: true, fiberPhase: 'unloading' },
    { entryId: 'unobserved', moduleName: 'unscoped-plugin', enabled: true, fiberPhase: null },
    { entryId: 'disabled-entry', moduleName: '@unieai/uad-host-directory-picker-native', enabled: false, fiberPhase: null },
  ],
} as unknown as Snapshot

function groupCount(container: HTMLElement, id: string): string | undefined {
  return container
    .querySelector(`[data-plugin-group='${id}'] [data-plugin-count]`)
    ?.textContent ?? undefined
}

describe('PluginDirectoryArea', () => {
  it('groups by effective enablement and marks runtime phase only where one exists', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const list = vi.fn(() => deferred.promise)
    const view = render(<PluginDirectoryArea {...props(list)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.title, level: 2 })).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(list).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.enabledTag, level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.disabledTag, level: 3 })).toBeTruthy()
    expect(groupCount(view.container, 'enabled')).toBe('6')
    expect(groupCount(view.container, 'disabled')).toBe('1')
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText(en.note)).toBeTruthy()

    // Six enabled rows carry a phase mark; the disabled row carries none,
    // because a disabled entry has no root Fiber to report on.
    for (const value of [
      en.active, en.pending, en.loadingPhase, en.failed, en.unloading, en.unobserved,
    ]) {
      expect(screen.getByRole('img', { name: value })).toBeTruthy()
    }
    expect(screen.getAllByRole('img')).toHaveLength(6)

    // The title is the short module name; the line under it is the exact
    // specifier, and an unscoped specifier keeps its whole name.
    expect(screen.getByText('hmr')).toBeTruthy()
    expect(screen.getByText('@unieai/cordis-plugin-hmr')).toBeTruthy()
    expect(screen.getByText('pending-name')).toBeTruthy()
    expect(screen.getAllByText('unscoped-plugin')).toHaveLength(2)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()
    // The Loader entry id is not drawn, but it stays on the row.
    expect(view.container.querySelector('[data-plugin-entry=\'8a1b2c3d\']')).toBeTruthy()
  })

  it('filters by module name or Loader entry id and drops an emptied group', async () => {
    const view = render(<PluginDirectoryArea {...props(async () => SNAPSHOT)} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    fireEvent.change(search, { target: { value: 'disabled-entry' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: en.enabledTag })).toBeNull()
    expect(groupCount(view.container, 'disabled')).toBe('1')

    fireEvent.change(search, { target: { value: 'CORDIS-PLUGIN-HMR' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('hmr')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: en.disabledTag })).toBeNull()

    fireEvent.change(search, { target: { value: 'not-a-plugin' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
    expect(screen.queryByText(en.empty)).toBeNull()
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<PluginDirectoryAreaInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce({ entries: [] })
    render(<PluginDirectoryArea {...props(list)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
    expect(screen.queryByText(en.emptySearch)).toBeNull()
  })

  it('contains a synchronous Remote failure and ignores a result after unmount', async () => {
    const syncFailure = vi.fn(() => { throw new Error('namespace unavailable') }) as PluginDirectoryAreaInjected['list']
    const failed = render(<PluginDirectoryArea {...props(syncFailure)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginDirectoryArea {...props(() => deferred.promise)} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const pendingFailure = render(<PluginDirectoryArea {...props(() => deferredFailure.promise)} />)
    pendingFailure.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
