// @vitest-environment jsdom
/**
 * The sidebar's account row as the user meets it: the identity it shows, and
 * the menu it opens. The state that matters most is the one this build ships
 * in — `unavailable`, where nobody is signed in — because the menu must still
 * be honest there: no header, no sign-out, and only the rows this composition
 * can actually serve.
 *
 * The signed-in cases render from a hand-built {@link UnieAiAccount} — nothing
 * about a person is invented for any other state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { UnieAiAccount, UnieAiAccountState } from '../src/account-contract.ts'
import {
  SidebarAccountRow, type SidebarAccountRowComponentProps,
} from '../src/client/SidebarAccountRow.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as SidebarAccountRowComponentProps['t']

const ACCOUNT: UnieAiAccount = {
  identity: { displayName: '林小明', email: 'ming@example.com' },
  plan: { label: 'Pro' },
  usage: [],
}

const LOCALES = { active: 'zh-CN', locales: [{ id: 'zh-CN', label: '简体中文' }, { id: 'en', label: 'English' }] }

/**
 * Mount the row.
 * @param state - account state the source reports.
 * @param options - column width, and which optional services are composed.
 * @returns the spies and the render result.
 */
function setup(state: UnieAiAccountState, options: {
  wide?: boolean
  /** Resolved scheme, or null for a composition with no theme service. */
  scheme?: 'light' | 'dark' | null
  /** Whether a settings panel is composed to open. */
  panel?: boolean
} = {}) {
  const { wide = true, scheme = 'dark', panel = true } = options
  const store = createSnapshotStore<UnieAiAccountState>(state)
  const signIn = vi.fn()
  const signOut = vi.fn()
  const openAccountSettings = vi.fn()
  const setColorScheme = vi.fn()
  const setLocale = vi.fn()
  const props = {
    wide,
    t,
    useAccount: bindSnapshotSelector(store),
    useColorScheme: bindSnapshotSelector(createSnapshotStore<'light' | 'dark' | null>(scheme)),
    useLocaleState: bindSnapshotSelector(createSnapshotStore(LOCALES)),
    useSettingsPanel: bindSnapshotSelector(createSnapshotStore(panel)),
    signIn,
    signOut,
    openAccountSettings,
    setColorScheme,
    setLocale,
  } as unknown as SidebarAccountRowComponentProps
  const view = render(<SidebarAccountRow {...props} />)
  return { signIn, signOut, openAccountSettings, setColorScheme, setLocale, view }
}

/** Open the row's menu. */
function openMenu(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  return screen.getByRole('menu')
}

describe('SidebarAccountRow', () => {
  it('is a menu trigger, and names no person with no gateway composed', () => {
    // The shipping state. The row opens a menu in every state — that is what
    // the reference row is — but it names no person, address, or plan.
    setup({ status: 'unavailable' })
    const trigger = screen.getByRole('button')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('未登录')).toBeTruthy()
  })

  it('carries no header and no sign-out while there is no session', () => {
    // Both would be lies here: nothing to name, and nothing to sign out of.
    setup({ status: 'unavailable' })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: zh['menu.signOut'] })).toBeNull()
    expect(screen.getByRole('menuitem', { name: zh['menu.profile'] })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: zh['menu.language'] })).toBeTruthy()
  })

  it('keeps sign-in reachable from the menu once a gateway holds no session', () => {
    // The row itself now opens a menu, so the gesture it used to BE moves
    // into that menu rather than disappearing from the column.
    const { signIn } = setup({ status: 'signed-out' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '登录' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('offers the retry in the menu after a failure', () => {
    const { signIn } = setup({ status: 'failed', message: '网络中断' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '重试' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('heads the menu with the address and plan, and offers sign-out, once signed in', () => {
    const { signOut } = setup({ status: 'signed-in', account: ACCOUNT })
    openMenu()
    expect(screen.getByText('ming@example.com')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.signOut'] }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('heads the menu with the address itself, never with a handle made from it', () => {
    setup({ status: 'signed-in', account: ACCOUNT })
    openMenu()
    expect(screen.getByText('ming@example.com')).toBeTruthy()
    expect(screen.queryByText('@ming')).toBeNull()
  })

  it('sends each personal row to its own settings page', () => {
    // Profile, Usage and Invite are three settings pages, exactly as they are
    // three tabs in the reference's own settings dialog.
    const { openAccountSettings } = setup({ status: 'signed-in', account: ACCOUNT })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.usage'] }))
    expect(openAccountSettings).toHaveBeenCalledWith('unieai-usage')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.invite'] }))
    expect(openAccountSettings).toHaveBeenCalledWith('unieai-invite')

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.profile'] }))
    expect(openAccountSettings).toHaveBeenCalledWith('unieai-account')
  })

  it('drops the personal rows when no settings panel is composed', () => {
    setup({ status: 'unavailable' }, { panel: false })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: zh['menu.profile'] })).toBeNull()
    expect(screen.getByRole('menuitem', { name: zh['menu.language'] })).toBeTruthy()
  })

  it('offers the other colour scheme and keeps the menu open on the switch', () => {
    // The reference calls preventDefault() on this row's select so the switch
    // can be seen taking effect, and undone, without reopening the menu.
    const { setColorScheme } = setup({ status: 'unavailable' }, { scheme: 'dark' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.lightMode'] }))
    expect(setColorScheme).toHaveBeenCalledWith('light')
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
  })

  it('drops the appearance row when no theme service is composed', () => {
    setup({ status: 'unavailable' }, { scheme: null })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: zh['menu.lightMode'] })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: zh['menu.darkMode'] })).toBeNull()
  })

  it('switches the locale from the language submenu', () => {
    const { setLocale } = setup({ status: 'unavailable' })
    openMenu()
    const language = screen.getByRole('menuitem', { name: zh['menu.language'] })
    expect(language.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.focus(language)
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(setLocale).toHaveBeenCalledWith('en')
  })

  it('never offers platform administration', () => {
    // Conditional on isAdmin in the reference; this is the personal edition,
    // so the condition is never true and the row does not exist.
    setup({ status: 'signed-in', account: ACCOUNT })
    openMenu()
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.textContent).not.toMatch(/admin|管理/i)
    }
  })

  it('shows the name with a monogram when the account carries no avatar', () => {
    setup({ status: 'signed-in', account: ACCOUNT })
    expect(screen.getByText('林小明')).toBeTruthy()
    expect(screen.getByText('林')).toBeTruthy()
  })

  it('falls back to the address when the supplier left the name blank', () => {
    setup({
      status: 'signed-in',
      account: { ...ACCOUNT, identity: { displayName: '  ', email: 'ming@example.com' } },
    })
    expect(screen.getByText('ming@example.com')).toBeTruthy()
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('draws the avatar the account gives it, in place of the monogram', () => {
    const { view } = setup({
      status: 'signed-in',
      account: { ...ACCOUNT, identity: { ...ACCOUNT.identity, avatarUrl: 'https://x.test/a.png' } },
    })
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe('https://x.test/a.png')
    expect(screen.queryByText('林')).toBeNull()
  })

  it('drops to the identity mark alone on the rail', () => {
    // The 56px rail has no room for a name; the mark and its tooltip carry it.
    setup({ status: 'signed-in', account: ACCOUNT }, { wide: false })
    expect(screen.queryByText('林小明')).toBeNull()
    expect(screen.getByText('林')).toBeTruthy()
  })

  it('carries the longer truth as the row’s tooltip', () => {
    // A 40px row fits one line. The state that needs a sentence — no gateway
    // in this build — puts it in the bubble rather than inventing a place for
    // it in the column.
    setup({ status: 'unavailable' })
    fireEvent.focus(screen.getByRole('button'))
    expect(screen.getByRole('tooltip').textContent).toBe(zh['connect.unavailable'])
  })
})
