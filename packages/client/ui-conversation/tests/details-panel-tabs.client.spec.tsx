// @vitest-environment jsdom
/**
 * The details column's tab strip.
 *
 * The regression this pins: `+` and its dropdown sat inside the tab list,
 * which is a horizontal scroll container, so the absolutely positioned menu
 * was clipped by it. The menu opened invisibly and the dismiss scrim then
 * swallowed the next click, which made the button read as dead.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PanelMenu, PANEL_ITEMS } from '../src/client/skeleton/PanelMenu.tsx'

afterEach(cleanup)

const t = ((key: string) => key) as never

describe('the open-what menu', () => {
  it('offers one row per destination the column can open', () => {
    render(<PanelMenu placement="menu" t={t} onOpen={() => {}} />)
    expect(screen.getAllByRole('menuitem')).toHaveLength(PANEL_ITEMS.length)
  })

  it('reports which destination was chosen', () => {
    const onOpen = vi.fn()
    render(<PanelMenu placement="panel" t={t} onOpen={onOpen} />)
    fireEvent.click(screen.getAllByRole('menuitem')[0]!)
    expect(onOpen).toHaveBeenCalledWith(PANEL_ITEMS[0]!.id)
  })

  it('offers the terminal everywhere, and lets the Host be the fence', () => {
    // The row used to be withheld off loopback. `terminal.*` is pinned on the
    // Host, which is the fence; hiding the row here as well only meant that a
    // person reaching this app through a tunnel or `localhost` rather than
    // `127.0.0.1` found the feature silently missing with nothing to read.
    render(<PanelMenu placement="menu" t={t} onOpen={() => {}} />)
    expect(screen.getAllByRole('menuitem').map(el => el.textContent))
      .toContain('panel.terminal')
  })

  it('renders the same rows in both placements', () => {
    // The empty column and the `+` dropdown are one menu in two frames; two
    // components would let them drift into different offers for one act.
    const { container: asMenu } = render(<PanelMenu placement="menu" t={t} onOpen={() => {}} />)
    const { container: asPanel } = render(<PanelMenu placement="panel" t={t} onOpen={() => {}} />)
    const labels = (root: HTMLElement) =>
      [...root.querySelectorAll('[role="menuitem"]')].map(el => el.textContent)
    expect(labels(asMenu)).toEqual(labels(asPanel))
  })
})
