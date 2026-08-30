// @vitest-environment jsdom
/**
 * The details column must actually OPEN through `ctx.layout`.
 *
 * app-frame.client.spec.tsx drives the store instance directly
 * (`instance.actions.openDetails()`), which proves the solver and the grid but
 * skips the seam production uses: a control calls `ctx.layout.toggleDetails()`,
 * the LayoutController forwards to the actions its `inject` hook was handed,
 * and the frame re-renders from the store those actions write. Every existing
 * assertion on `data-details-collapsed` checks it is 'true' — nothing in the
 * repo asserts the column ever opens — so a break in that seam is invisible.
 */
import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { SlotTestRuntime, stubSettingsScope } from '@unieai/uad-client-test-runtime'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import { apply as themeApply, inject as themeInject } from '@unieai/uad-client-ui-theme/client'
import { apply, inject } from '@unieai/uad-client-ui-layout/client'
import type { LayoutController } from '@unieai/uad-client-ui-layout/client'

// jsdom has no layout engine: the frame observes its own box, so the observer
// and a width are stubbed exactly as app-frame.client.spec.tsx does.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
window.innerWidth = 1920

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const { ctx } = runtime
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: themeInject, apply: themeApply }).await()
  await ctx.plugin({ inject: [...inject], apply }).await()
  return runtime
}

/** The frame's three grid tracks, as the inline style states them. */
function tracks(view: { container: HTMLElement }): string {
  const frame = view.container.querySelector('[style*="grid-template-columns"]')
  return (frame as HTMLElement | null)?.style.gridTemplateColumns ?? 'NO FRAME'
}

describe('details column opens through ctx.layout', () => {
  it('toggleDetails on the service opens the column the frame renders', async () => {
    const runtime = await bench()
    // A non-blank current session: AppFrame gates the column's width on one.
    const id = await runtime.sessions.add({ id: 's-details' }, { current: true })
    await runtime.sessions.updateSummary(id, { blank: false })
    const view = runtime.renderRoot()
    expect(tracks(view)).toContain('0px')

    const layout = runtime.ctx.get('layout') as LayoutController
    await act(async () => { layout.toggleDetails(); await Promise.resolve() })

    expect(tracks(view)).not.toMatch(/\s0px$/)
  })
})
