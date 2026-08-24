// @vitest-environment jsdom
/**
 * The Invite-a-friend dialog: what it draws, what it refuses to draw, and when
 * it will send.
 *
 * Two claims matter most. Send is closed until the field holds a plausible
 * address, so the round trip that can only fail is never made — while every
 * verdict about WHICH addresses are acceptable still comes from the supplier
 * and is printed in the supplier's own refusal words. And the dialog publishes
 * no invite link or code: the product mints one per invited address, the
 * account holds none of its own, and a link on this screen would be invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import type { UnieAiInviteResult } from '../src/account-contract.ts'
import {
  InviteFriendDialog, isPlausibleEmail, type InviteFriendDialogProps,
} from '../src/client/InviteFriendDialog.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as InviteFriendDialogProps['t']

function setup(send: (email: string) => Promise<UnieAiInviteResult>
  = vi.fn(async () => ({ status: 'sent' as const }))) {
  const onClose = vi.fn()
  const view = render(<InviteFriendDialog open t={t} sendInvite={send} onClose={onClose} />)
  const field = screen.getByLabelText(zh['invite.emailPlaceholder']) as HTMLInputElement
  const sendButton = screen.getByRole('button', { name: zh['invite.send'] }) as HTMLButtonElement
  return { onClose, send, view, field, sendButton }
}

describe('isPlausibleEmail', () => {
  it('accepts an address the request could succeed with', () => {
    expect(isPlausibleEmail('friend@example.com')).toBe(true)
    expect(isPlausibleEmail('first.last+tag@mail.example.co.jp')).toBe(true)
  })

  it('rejects the shapes no supplier could accept', () => {
    for (const value of ['', 'friend', 'friend@', '@example.com', 'friend@example', 'a b@example.com']) {
      expect(isPlausibleEmail(value)).toBe(false)
    }
  })
})

describe('Invite a friend dialog', () => {
  it('draws nothing while closed', () => {
    const onClose = vi.fn()
    const send = vi.fn(async () => ({ status: 'sent' as const }))
    render(<InviteFriendDialog open={false} t={t} sendInvite={send} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names itself, says what an invite earns, and asks for one address', () => {
    setup()
    expect(screen.getByRole('dialog', { name: zh['invite.title'] })).toBeTruthy()
    expect(screen.getByText(zh['invite.reward'])).toBeTruthy()
    expect(screen.getByText(zh['invite.body'])).toBeTruthy()
    expect(screen.getByPlaceholderText(zh['invite.emailPlaceholder'])).toBeTruthy()
  })

  it('publishes no invite link or code, because the account has none', () => {
    setup()
    // The product's referral model is one single-use code per invited address.
    // A link here would belong to nobody.
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button', { name: zh['invite.copy'] })).toBeNull()
  })

  it('keeps Send closed until the field holds a plausible address', () => {
    const bench = setup()
    expect(bench.sendButton.disabled).toBe(true)

    fireEvent.change(bench.field, { target: { value: 'friend' } })
    expect(bench.sendButton.disabled).toBe(true)

    fireEvent.change(bench.field, { target: { value: 'friend@example' } })
    expect(bench.sendButton.disabled).toBe(true)

    fireEvent.change(bench.field, { target: { value: ' friend@example.com ' } })
    expect(bench.sendButton.disabled).toBe(false)
  })

  it('does not send an implausible address even when the form is submitted directly', () => {
    const send = vi.fn(async () => ({ status: 'sent' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'friend' } })
    fireEvent.submit(bench.field.closest('form')!)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the trimmed address and clears the field on success', async () => {
    const send = vi.fn(async () => ({ status: 'sent' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: ' friend@example.com ' } })
    fireEvent.click(bench.sendButton)

    await waitFor(() => { expect(send).toHaveBeenCalledWith('friend@example.com') })
    await waitFor(() => { expect(screen.getByText(zh['invite.sentBody'])).toBeTruthy() })
    // The address is no longer the user's to fix, so it goes.
    expect(bench.field.value).toBe('')
  })

  it('says which refusal it was, and keeps the address that has to be corrected', async () => {
    const send = vi.fn(async () => ({ status: 'refused' as const, reason: 'already-invited' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'friend@example.com' } })
    fireEvent.click(bench.sendButton)

    await waitFor(() => { expect(screen.getByText(zh['invite.errorAlreadyInvited'])).toBeTruthy() })
    expect(bench.field.value).toBe('friend@example.com')
  })

  it('reports an attempt that reached no verdict', async () => {
    const send = vi.fn(async () => ({ status: 'failed' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'friend@example.com' } })
    fireEvent.click(bench.sendButton)
    await waitFor(() => { expect(screen.getByText(zh['invite.errorToast'])).toBeTruthy() })
  })

  it('admits a deployment that cannot send invites at all', async () => {
    const send = vi.fn(async () => ({ status: 'unsupported' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'friend@example.com' } })
    fireEvent.click(bench.sendButton)
    await waitFor(() => { expect(screen.getByText(zh['invite.unsupported'])).toBeTruthy() })
  })

  it('freezes the field and the button while one attempt is in flight', async () => {
    let settle: (result: UnieAiInviteResult) => void = () => {}
    const send = vi.fn(() => new Promise<UnieAiInviteResult>((resolve) => { settle = resolve }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'friend@example.com' } })
    fireEvent.click(bench.sendButton)

    await waitFor(() => { expect(screen.getByText(zh['invite.sending'])).toBeTruthy() })
    expect(bench.field.disabled).toBe(true)
    // A second press must not open a second attempt.
    fireEvent.click(screen.getByRole('button', { name: zh['invite.sending'] }))
    expect(send).toHaveBeenCalledTimes(1)

    settle({ status: 'sent' })
    await waitFor(() => { expect(screen.getByText(zh['invite.sentBody'])).toBeTruthy() })
  })

  it('drops the draft and the last verdict when it closes', async () => {
    const send = vi.fn(async () => ({ status: 'refused' as const, reason: 'self-invite' as const }))
    const bench = setup(send)
    fireEvent.change(bench.field, { target: { value: 'me@example.com' } })
    fireEvent.click(bench.sendButton)
    await waitFor(() => { expect(screen.getByText(zh['invite.errorSelfInvite'])).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: zh['profile.close'] }))
    expect(bench.onClose).toHaveBeenCalledTimes(1)
    expect(bench.field.value).toBe('')
    expect(screen.queryByText(zh['invite.errorSelfInvite'])).toBeNull()
  })

  it('closes on Escape, which is the shared dialog behaviour', () => {
    const bench = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(bench.onClose).toHaveBeenCalledTimes(1)
  })
})
