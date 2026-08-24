// @vitest-environment jsdom
/**
 * The three account settings pages as the user meets them: Account, Regular
 * usage limits, and Invite friends.
 *
 * The pages have no backend yet, so the specs that matter most are the
 * not-connected postures — and there are three pages to get them right on now,
 * not one. `unavailable` explains itself and offers no button that would do
 * nothing; `signed-out` makes signing in the one action on the screen; and
 * EVERY page answers both, because a tab that renders blank when signed out is
 * a tab the reader is left staring at.
 *
 * The signed-in cases render from a hand-built {@link UnieAiAccount} — the same
 * contract a desktop BFF will fill — and assert that nothing is invented for a
 * field the supplier left out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@unieai/uad-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import type {
  UnieAiAccount, UnieAiAccountState, UnieAiInviteResult,
} from '../src/account-contract.ts'
import { AccountSection, type AccountSectionComponentProps } from '../src/client/AccountSection.tsx'
import { UsageSection, type UsageSectionComponentProps } from '../src/client/UsageSection.tsx'
import { InviteSection, type InviteSectionComponentProps } from '../src/client/InviteSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as AccountSectionComponentProps['t']

function setup(state: UnieAiAccountState) {
  const store = createSnapshotStore<UnieAiAccountState>(state)
  const locales = createSnapshotStore<string>('zh-CN')
  const signIn = vi.fn()
  const signOut = vi.fn()
  const saveProfile = vi.fn(async () => ({ status: 'saved' as const }))
  const props = {
    t,
    useAccount: bindSnapshotSelector(store),
    useActiveLocale: bindSnapshotSelector(locales),
    signIn,
    signOut,
    saveProfile,
  } as unknown as AccountSectionComponentProps
  const view = render(<AccountSection {...props} />)
  return { store, signIn, signOut, saveProfile, view }
}

function setupUsage(state: UnieAiAccountState) {
  const store = createSnapshotStore<UnieAiAccountState>(state)
  const signIn = vi.fn()
  const props = {
    t,
    useAccount: bindSnapshotSelector(store),
    signIn,
  } as unknown as UsageSectionComponentProps
  const view = render(<UsageSection {...props} />)
  return { signIn, view }
}

/** `'none'` stands for a gateway that exposes no invite write at all. */
type Send = ((email: string) => Promise<UnieAiInviteResult>) | 'none'

function setupInvite(
  state: UnieAiAccountState,
  send: Send = vi.fn(async () => ({ status: 'sent' as const })),
) {
  const sendInvite = send === 'none' ? undefined : send
  const store = createSnapshotStore<UnieAiAccountState>(state)
  const signIn = vi.fn()
  const props = {
    t,
    useAccount: bindSnapshotSelector(store),
    signIn,
    sendInvite,
  } as unknown as InviteSectionComponentProps
  const view = render(<InviteSection {...props} />)
  return { signIn, sendInvite, view }
}

const ACCOUNT: UnieAiAccount = {
  identity: { displayName: '林小明', email: 'ming@example.com' },
  plan: { label: 'Pro' },
  usage: [
    { id: 'agent-turns', label: 'Agent 对话次数', used: 50, limit: 200, resetsAt: '9 月 1 日 08:00' },
    { id: 'chat-tokens', label: '一般模式 Token 用量', used: 1234567, limit: null },
  ],
  invites: { credits: 2, sentCount: 1 },
}

describe('Account page, not connected', () => {
  it('explains an unavailable build without offering a dead button', () => {
    setup({ status: 'unavailable' })
    expect(screen.getByText(zh['connect.unavailable'])).toBeTruthy()
    expect(screen.getByText(zh['connect.eyebrow'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['connect.action'] })).toBeNull()
  })

  it('makes signing in the one action once a gateway exists', () => {
    const bench = setup({ status: 'signed-out' })
    expect(screen.getByText(zh['connect.body'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.action'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })

  it('offers nothing to edit while nobody is signed in', () => {
    setup({ status: 'signed-out' })
    expect(screen.getByText(zh['row.signedOut'])).toBeTruthy()
    // No avatar trigger and no name pencil: both would open a form whose Save
    // has no account to reach.
    expect(screen.queryByRole('button', { name: zh['profile.changeAvatar'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['profile.editName'] })).toBeNull()
    // The strip is still what the screen IS, and every cell reads as unknown.
    expect(screen.getAllByText('—')).toHaveLength(5)
  })

  it('surfaces the supplier failure and offers a retry', () => {
    const bench = setup({ status: 'failed', message: '连不上 UnieAI。' })
    expect(screen.getByText('连不上 UnieAI。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.retry'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })

  it('points at General for appearance and language instead of repeating them', () => {
    setup({ status: 'unavailable' })
    expect(screen.getByText(zh['general.hint'])).toBeTruthy()
  })
})

describe('Account page, signed in', () => {
  it('shows who you are, on which plan, and lets you sign out', () => {
    const bench = setup({ status: 'signed-in', account: ACCOUNT })
    // Name and plan belong to the header; the card below it carries the
    // address and the way out, so neither fact is printed twice.
    expect(screen.getByText('林小明')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText('邮箱：ming@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['profile.signOut'] }))
    expect(bench.signOut).toHaveBeenCalledTimes(1)
  })

  it('prints the address exactly once, in the card that owns it', () => {
    const view = setup({ status: 'signed-in', account: ACCOUNT }).view
    const printed = [...view.container.querySelectorAll('*')]
      .filter(node => node.childElementCount === 0 && (node.textContent ?? '').includes('ming@example.com'))
    expect(printed).toHaveLength(1)
    // And never with a handle's decoration, which is what standing it in for
    // one used to look like.
    expect(view.container.textContent).not.toContain('@ming ·')
  })

  it('prints the name exactly once, in the header that edits it', () => {
    const view = setup({ status: 'signed-in', account: ACCOUNT }).view
    const printed = [...view.container.querySelectorAll('*')]
      .filter(node => node.childElementCount === 0 && node.textContent === '林小明')
    expect(printed).toHaveLength(1)
    // One mark, not a header mark plus a form mark below it.
    expect(view.container.querySelectorAll('[aria-label="更改头像"]')).toHaveLength(1)
  })

  it('edits the profile in the header, and stores it through the supplier', async () => {
    const bench = setup({ status: 'signed-in', account: ACCOUNT })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.editName'] }))
    const field = screen.getByLabelText(zh['profile.displayName']) as HTMLInputElement
    expect(field.value).toBe('林小明')

    fireEvent.change(field, { target: { value: '林大明' } })
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))

    await waitFor(() => {
      expect(bench.saveProfile).toHaveBeenCalledWith({ displayName: '林大明' })
    })
  })

  it('draws every activity cell it was given, and an em dash for the rest', () => {
    setup({
      status: 'signed-in',
      account: {
        ...ACCOUNT,
        activity: { stats: { 'total-tokens': '1,204', 'current-streak': '3d' }, daily: [] },
      },
    })
    expect(screen.getByText('1,204')).toBeTruthy()
    expect(screen.getByText('3d')).toBeTruthy()
    // Three unreported figures, and not one of them reads as zero.
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('draws the Token Activity heatmap and its three modes over the reported series', () => {
    const bench = setup({
      status: 'signed-in',
      account: {
        ...ACCOUNT,
        activity: { stats: {}, daily: [{ date: '2026-08-20', tokens: 4_096 }] },
      },
    })
    expect(screen.getByText(zh['activity.title'])).toBeTruthy()
    for (const mode of ['activity.daily', 'activity.weekly', 'activity.cumulative'] as const) {
      expect(screen.getByRole('button', { name: zh[mode] })).toBeTruthy()
    }
    // 53 whole weeks of cells, plus however many the week alignment adds.
    const cells = bench.view.container.querySelectorAll('[title]')
    expect(cells.length).toBeGreaterThanOrEqual(53 * 7)
    // Daily is the mode it opens in, and the segment says so.
    expect(screen.getByRole('button', { name: zh['activity.daily'] }).getAttribute('aria-pressed'))
      .toBe('true')
    fireEvent.click(screen.getByRole('button', { name: zh['activity.weekly'] }))
    expect(screen.getByRole('button', { name: zh['activity.weekly'] }).getAttribute('aria-pressed'))
      .toBe('true')
  })

  it('says so rather than drawing an empty year, and draws nothing at all with no activity', () => {
    setup({ status: 'signed-in', account: { ...ACCOUNT, activity: { stats: {}, daily: [] } } })
    expect(screen.getByText(zh['activity.empty'])).toBeTruthy()
    cleanup()

    setup({ status: 'signed-in', account: ACCOUNT })
    expect(screen.queryByText(zh['activity.title'])).toBeNull()
  })

  it('falls back to a monogram, and uses the avatar the supplier gave', () => {
    setup({ status: 'signed-in', account: ACCOUNT })
    expect(screen.getByText('林')).toBeTruthy()
    cleanup()

    // The avatar is decorative (empty alt inside the mark's own labelled
    // button), so it is addressed through the DOM rather than by a role.
    const withImage = setup({
      status: 'signed-in',
      account: {
        ...ACCOUNT,
        identity: { displayName: '  ', email: 'ming@example.com', avatarUrl: 'https://unieai.example/a.png' },
      },
    })
    expect(withImage.view.container.querySelector('img')?.getAttribute('src'))
      .toBe('https://unieai.example/a.png')
    cleanup()

    // Both fields blank: a monogram cannot be derived, and none is invented.
    const blank = setup({
      status: 'signed-in',
      account: { ...ACCOUNT, identity: { displayName: '', email: '' } },
    })
    expect(blank.view.container.querySelector('img')).toBeNull()
  })

  it('leaves usage and invites to their own pages', () => {
    const view = setup({ status: 'signed-in', account: ACCOUNT }).view
    expect(view.container.textContent).not.toContain(zh['invite.reward'])
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('Regular usage limits page', () => {
  it('names itself once, and only once', () => {
    const view = setupUsage({ status: 'signed-in', account: ACCOUNT }).view
    const printed = [...view.container.querySelectorAll('*')]
      .filter(node => node.childElementCount === 0 && node.textContent === zh['usage.title'])
    expect(printed).toHaveLength(1)
    expect(screen.getByText(zh['usage.intro'])).toBeTruthy()
  })

  it('reports what is left of each metered allowance', () => {
    setupUsage({ status: 'signed-in', account: ACCOUNT })
    expect(screen.getByText('50 / 200')).toBeTruthy()
    expect(screen.getByText('剩余 75%')).toBeTruthy()
    expect(screen.getByText('重置时间 9 月 1 日 08:00')).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Agent 对话次数' })
    expect(bar.getAttribute('aria-valuenow')).toBe('75')
  })

  it('says how often a windowed allowance resets, not just when', () => {
    setupUsage({
      status: 'signed-in',
      account: {
        ...ACCOUNT,
        usage: [{
          id: 'agent-turns',
          label: 'Agent 对话次数',
          used: 50,
          limit: 200,
          windowHours: 5,
          resetsAt: '2026-08-23 12:00',
        }],
      },
    })
    // An instant alone means nothing on its own; the window length is what
    // turns it into a reading someone can plan around.
    expect(screen.getByText('每 5 小时重置 · 下次 2026-08-23 12:00')).toBeTruthy()
  })

  it('draws no bar for an unmetered allowance', () => {
    setupUsage({ status: 'signed-in', account: ACCOUNT })
    expect(screen.getAllByText(zh['usage.unlimited'])).toHaveLength(2)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  })

  it('says so when the account reports no allowances at all', () => {
    setupUsage({ status: 'signed-in', account: { ...ACCOUNT, usage: [] } })
    expect(screen.getByText(zh['usage.empty'])).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('keeps its own page signed out, with the way back in on it', () => {
    const bench = setupUsage({ status: 'signed-out' })
    // Not blank, and not gone from the nav: the page says why it is empty.
    expect(screen.getByText(zh['usage.title'])).toBeTruthy()
    expect(screen.getByText(zh['connect.body'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.action'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })

  it('says what a build with no account service can do, and offers no dead button', () => {
    setupUsage({ status: 'unavailable' })
    expect(screen.getByText(zh['connect.unavailable'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['connect.action'] })).toBeNull()
  })

  it('names the failure and offers the retry on this page too', () => {
    const bench = setupUsage({ status: 'failed', message: '连不上 UnieAI。' })
    expect(screen.getByText('连不上 UnieAI。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.retry'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })
})

describe('Invite friends page', () => {
  it('names itself once, and says what an invite earns once', () => {
    const view = setupInvite({ status: 'signed-in', account: ACCOUNT }).view
    for (const line of [zh['invite.title'], zh['invite.body']]) {
      const printed = [...view.container.querySelectorAll('*')]
        .filter(node => node.childElementCount === 0 && node.textContent === line)
      expect(printed).toHaveLength(1)
    }
  })

  it('shows the reward line, the banked resets, and how many were invited', () => {
    setupInvite({ status: 'signed-in', account: ACCOUNT })
    expect(screen.getByText(zh['invite.reward'])).toBeTruthy()
    expect(screen.getByText('可用的速率限制重置：2')).toBeTruthy()
    expect(screen.getByText('已邀请 1 人')).toBeTruthy()
    // No standing personal link: the product has none, so the card offers none.
    expect(screen.queryByRole('button', { name: zh['invite.copy'] })).toBeNull()
  })

  it('lists each sent invite with its own link, and copies that link', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    setupInvite({
      status: 'signed-in',
      account: {
        ...ACCOUNT,
        invites: {
          credits: 2,
          sent: [{
            inviteeEmail: 'friend@example.com',
            status: '待加入',
            sentAt: '2026-08-01 09:00',
            url: 'https://unieai.example/invite/ref/abc',
          }],
        },
      },
    })
    expect(screen.getByText('friend@example.com')).toBeTruthy()
    expect(screen.getByText('待加入 · 2026-08-01 09:00')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['invite.copy'] }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://unieai.example/invite/ref/abc')
    })
    vi.unstubAllGlobals()
  })

  it('opens the compose dialog, which is where an address is typed', () => {
    // The page carries the standing; the address and its Send live in the
    // dialog, so the field exists nowhere else on this page.
    setupInvite({ status: 'signed-in', account: ACCOUNT })
    expect(screen.queryByLabelText(zh['invite.emailPlaceholder'])).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['invite.compose'] }))
    expect(screen.getByRole('dialog', { name: zh['invite.title'] })).toBeTruthy()
    expect(screen.getByLabelText(zh['invite.emailPlaceholder'])).toBeTruthy()
    // Nothing is sendable until an address is; invite-friend-dialog.client.spec.tsx
    // owns the whole of that gate.
    expect(screen.getByRole('button', { name: zh['invite.send'] }).hasAttribute('disabled')).toBe(true)
  })

  it('forwards the typed address to the gateway', async () => {
    const send = vi.fn(async () => ({ status: 'sent' as const }))
    const bench = setupInvite({ status: 'signed-in', account: ACCOUNT }, send)
    fireEvent.click(screen.getByRole('button', { name: zh['invite.compose'] }))
    fireEvent.change(screen.getByLabelText(zh['invite.emailPlaceholder']), {
      target: { value: 'friend@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['invite.send'] }))
    await waitFor(() => { expect(bench.sendInvite).toHaveBeenCalledWith('friend@example.com') })
  })

  it('drops the compose trigger when the gateway offers no write', () => {
    setupInvite({ status: 'signed-in', account: ACCOUNT }, 'none')
    expect(screen.queryByRole('button', { name: zh['invite.compose'] })).toBeNull()
    expect(screen.queryByLabelText(zh['invite.emailPlaceholder'])).toBeNull()
  })

  it('says so when the supplier reports no referral standing', () => {
    // Omitted, not set to undefined: `exactOptionalPropertyTypes` makes an
    // absent standing a different value from an explicit undefined one.
    const { invites: _unused, ...withoutInvites } = ACCOUNT
    setupInvite({ status: 'signed-in', account: withoutInvites })
    expect(screen.getByText(zh['invite.empty'])).toBeTruthy()
  })

  it('keeps its own page signed out, with the way back in on it', () => {
    const bench = setupInvite({ status: 'signed-out' })
    expect(screen.getByText(zh['invite.title'])).toBeTruthy()
    expect(screen.getByText(zh['connect.body'])).toBeTruthy()
    // And no compose field over an account that does not exist yet.
    expect(screen.queryByLabelText(zh['invite.emailPlaceholder'])).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.action'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })

  it('says what a build with no account service can do, and offers no dead button', () => {
    setupInvite({ status: 'unavailable' })
    expect(screen.getByText(zh['connect.unavailable'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['connect.action'] })).toBeNull()
  })

  it('names the failure and offers the retry on this page too', () => {
    const bench = setupInvite({ status: 'failed', message: '连不上 UnieAI。' })
    expect(screen.getByText('连不上 UnieAI。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['connect.retry'] }))
    expect(bench.signIn).toHaveBeenCalledTimes(1)
  })
})

describe('the profile save, as the Account page composes it', () => {
  it('names the refusal a save was rejected for, and falls back when none arrived', async () => {
    const rejecting = vi.fn(async () => ({ status: 'failed' as const, reason: 'avatar-format' as const }))
    const store = createSnapshotStore<UnieAiAccountState>({ status: 'signed-in', account: ACCOUNT })
    const locales = createSnapshotStore<string>('zh-CN')
    const props = {
      t,
      useAccount: bindSnapshotSelector(store),
      useActiveLocale: bindSnapshotSelector(locales),
      signIn: vi.fn(),
      signOut: vi.fn(),
      saveProfile: rejecting,
    } as unknown as AccountSectionComponentProps
    render(<AccountSection {...props} />)

    fireEvent.click(screen.getByRole('button', { name: zh['profile.editName'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['profile.save'] }))
    await waitFor(() => { expect(screen.getByText(zh['profile.unsupportedImage'])).toBeTruthy() })
    expect(screen.queryByText(zh['profile.updateFailed'])).toBeNull()
  })
})
