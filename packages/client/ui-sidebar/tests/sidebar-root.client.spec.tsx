// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  SidebarAccountOwnerProps, SidebarFooterActionOwnerProps, SidebarNavActionOwnerProps,
  SidebarRootComponentProps, SidebarSectionOwnerProps, SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell never reads the global hooks itself, but they ride the standard
// props share; stub them as never-called functions.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function mountShell({ collapsed = false, width = 300 }: { collapsed?: boolean; width?: number } = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  let accountOwner: SidebarAccountOwnerProps | undefined
  let navActionOwner: SidebarNavActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={neverHook} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarAccountOwnerProps | SidebarFooterActionOwnerProps
          | SidebarNavActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.nav.action') {
          navActionOwner = owner
          return <div data-testid="nav-action-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.account') {
          accountOwner = owner
          return <div data-testid="account-seat" data-wide={owner.wide} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    navActionOwner: () => {
      if (navActionOwner === undefined) throw new Error('nav action owner not rendered')
      return navActionOwner
    },
    accountOwner: () => {
      if (accountOwner === undefined) throw new Error('account owner not rendered')
      return accountOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('routes New chat (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New chat' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders generic brand fallbacks when no package fills the slots', () => {
    vi.stubEnv('DSH_CLIENT_COMMIT_HASH', '0123456')
    const { container } = render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={neverHook} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('UnieAI Agent')).toBeTruthy()
    expect(screen.getByText('0123456')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('raises a search request rather than reaching into the region', () => {
    // The field belongs to ui-workspace. The shell asks; a second press is a
    // second request, which is why the share carries a nonce and not a flag.
    const b = mountShell()
    expect(b.regionOwner().searchRequest).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(b.regionOwner().searchRequest).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(b.regionOwner().searchRequest).toBe(2)
    // Expanded already, so no collapse toggle rode along with it.
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('expands the column before asking, when the search row is pressed on the rail', () => {
    const b = mountShell({ collapsed: true })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
    expect(b.regionOwner().searchRequest).toBe(1)
  })

  it('puts the account and settings occupants in ONE foot row, account first', () => {
    // The foot's shape is the contract here, and only the DOM carries it: a
    // stylesheet assertion proves the seat's box exists, not that the two
    // occupants landed in it. This spec is what fails if the merged row is
    // ever split back into two stacked seats.
    mountShell()
    const account = screen.getByTestId('account-seat')
    const settings = screen.getByTestId('settings-seat')
    const row = account.parentElement
    expect(row).not.toBeNull()
    expect(settings.parentElement).toBe(row)
    // Mark left, gear right — the order the reference row reads in.
    expect([...row!.children].indexOf(account)).toBeLessThan([...row!.children].indexOf(settings))
    // And that row is the last thing in the foot, under the actions list.
    const foot = row!.parentElement!
    expect([...foot.children]).toHaveLength(2)
    expect(foot.children[0]!.contains(screen.getByTestId('footer-action-seat'))).toBe(true)
    expect(foot.children[1]).toBe(row)
    // The nav-action seat is its own row above the browsing region, not in
    // the foot: a nav row that drifted into the foot would still pass every
    // owner-prop assertion in this file.
    expect(foot.contains(screen.getByTestId('nav-action-seat'))).toBe(false)
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // The account row closes the foot and rides the same flag.
    expect(b.accountOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(b.navActionOwner().wide).toBe(false)
    expect(b.accountOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })
})
