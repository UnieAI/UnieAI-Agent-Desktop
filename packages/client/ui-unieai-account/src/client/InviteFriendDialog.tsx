/**
 * The Invite-a-friend modal: the hero, what one invite earns, and the single
 * address field the product's invite endpoint accepts.
 *
 * The product invites BY EMAIL — the desktop BFF posts one address and the
 * product mints a single-use code for it — so this dialog publishes no
 * personal invite link and no referral code: the account HAS none. The only
 * links that exist belong to invites already sent, and the Invite friends page
 * lists them beside this dialog's trigger.
 *
 * Send stays disabled until the field holds a plausible address. That is a
 * formatting pre-check, not a second copy of the product's rule: which
 * addresses are acceptable, and which are the account's own, remain the
 * supplier's verdict and arrive as {@link UnieAiInviteRefusal}.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { Translate } from '@unieai/uad-client-ui-slots'
import {
  Button, IconCloseOutline16, IconRefreshOutline16, IconUserOutline16, Input, Modal,
} from '@unieai/uad-client-ui-primitives'
import type { UnieAiInviteRefusal, UnieAiInviteResult } from '../account-contract.ts'
import type { AccountKey } from './locales.ts'
import css from './InviteFriendDialog.module.css'

/** The line each refusal prints, in the product's own words. */
const REFUSAL_COPY: Readonly<Record<UnieAiInviteRefusal, AccountKey>> = {
  'invalid-email': 'invite.errorInvalidEmail',
  'self-invite': 'invite.errorSelfInvite',
  'already-invited': 'invite.errorAlreadyInvited',
}

/**
 * Whether an address is worth sending. One local address part, one `@`, and a
 * dotted domain — the shape below which the request cannot succeed, so the
 * button says so before a round trip. Everything narrower than that is the
 * supplier's rule and is not repeated here.
 * @param email - the address as typed, already trimmed.
 * @returns whether the dialog will submit it.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Props of the invite dialog. */
export interface InviteFriendDialogProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Section copy. */
  t: Translate<AccountKey>
  /**
   * Invite one address. Required rather than optional: the card mounts this
   * dialog only where the gateway offers the write, so a Send that cannot send
   * is unreachable rather than disabled.
   * @param email - the address to invite, trimmed.
   * @returns what the attempt established.
   */
  sendInvite: (email: string) => Promise<UnieAiInviteResult>
  /** Dismiss the dialog; the caller stops rendering it. */
  onClose: () => void
}

/**
 * Render the invite dialog.
 * @param props - visibility, copy, the send gesture, and dismissal.
 * @returns the dialog element tree; nothing while closed.
 */
export function InviteFriendDialog({ open, t, sendInvite, onClose }: InviteFriendDialogProps) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<UnieAiInviteResult | undefined>(undefined)

  const address = email.trim()
  const ready = isPlausibleEmail(address)

  // Dismissal drops the draft and the last verdict: the next opening is a new
  // invite, and a refusal left standing would describe an address that is no
  // longer in the field.
  const close = (): void => {
    setEmail('')
    setResult(undefined)
    onClose()
  }

  const submit = async (): Promise<void> => {
    if (!ready || sending) return
    setSending(true)
    setResult(undefined)
    const outcome = await sendInvite(address)
    setSending(false)
    setResult(outcome)
    // Only a sent invite clears the field: a refused address is the one the
    // user has to correct, and clearing it would hide what was refused.
    if (outcome.status === 'sent') setEmail('')
  }

  return (
    <Modal open={open} onClose={close} title={t('invite.title')} className={clsx(css.dialog)} headless>
      <div className={css.hero}>
        {/* Decorative. The reference puts the product mark on this band; the
            mark is a brand slot occupant owned by another plugin, which this
            package must not value-import, and a settings section renders no
            slots — so the tile carries the invite's own subject instead. */}
        <span className={css.mark} aria-hidden>
          <IconUserOutline16 size={32} />
        </span>
        <button
          type="button"
          className={css.close}
          // The section's existing Close label, rather than a second key for
          // the same word in the same dictionary.
          aria-label={t('profile.close')}
          onClick={close}
        >
          <IconCloseOutline16 size={14} />
        </button>
      </div>
      <div className={css.content}>
        {/* What one invite earns. The rate is the product's published referral
            terms, which this dictionary already carries; no supplier field
            reports a reward rate, so no figure is computed here. The reference
            strip's eligibility link is absent for the same reason: the account
            contract carries no terms URL for it to open. */}
        <p className={css.reward}>
          <IconRefreshOutline16 className={css.rewardIcon} />
          <span>{t('invite.reward')}</span>
        </p>
        <h2 className={css.title}>{t('invite.title')}</h2>
        <p className={css.description}>{t('invite.body')}</p>
        <form
          className={css.form}
          onSubmit={(event) => { event.preventDefault(); void submit() }}
        >
          <Input
            className={clsx(css.field)}
            type="email"
            value={email}
            placeholder={t('invite.emailPlaceholder')}
            disabled={sending}
            aria-label={t('invite.emailPlaceholder')}
            onChange={(event) => { setEmail(event.target.value) }}
          />
          <Button
            variant="primary"
            className={css.send}
            disabled={!ready || sending}
            onClick={() => { void submit() }}
          >
            {sending ? t('invite.sending') : t('invite.send')}
          </Button>
        </form>
        {result?.status === 'sent' && <p className={css.note}>{t('invite.sentBody')}</p>}
        {result?.status === 'refused' && <p className={css.failure}>{t(REFUSAL_COPY[result.reason])}</p>}
        {result?.status === 'failed' && <p className={css.failure}>{t('invite.errorToast')}</p>}
        {result?.status === 'unsupported' && <p className={css.failure}>{t('invite.unsupported')}</p>}
      </div>
    </Modal>
  )
}
