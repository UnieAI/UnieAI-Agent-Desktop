/**
 * Invite a friend: the account's referral standing, and the one write the
 * product actually offers on it.
 *
 * The product's referral model is a row per invited address, each with its own
 * single-use code — there is no standing personal invite link, so the card
 * shows none. What it shows is what the account has: the rate-limit resets its
 * invites have banked, how many invites it has sent, those invites when the
 * supplier lists them, and the way to send one more. Each listed invite
 * carries its own link, which is the only link on this screen a friend can
 * actually open.
 *
 * Composing lives in {@link InviteFriendDialog}, which this card opens. The
 * trigger exists only when the gateway can send: a supplier that exposes reads
 * alone leaves the card a read-only summary rather than a button that opens a
 * dialog whose Send cannot send.
 */
import { useEffect, useRef, useState } from 'react'
import type { Translate } from '@unieai/uad-client-ui-slots'
import {
  Button, IconCheckOutline16, IconCopyOutline16, writeClipboard,
} from '@unieai/uad-client-ui-primitives'
import type {
  UnieAiInviteResult, UnieAiInvites, UnieAiSentInvite,
} from '../account-contract.ts'
import { InviteFriendDialog } from './InviteFriendDialog.tsx'
import type { AccountKey } from './locales.ts'
import css from './AccountSection.module.css'

/** How long the copied confirmation stays up. */
const COPIED_MS = 1600

/** Props of the invite card. */
export interface InviteCardProps {
  /** The referral standing; absent where the supplier reports none. */
  invites: UnieAiInvites | undefined
  /** Section copy. */
  t: Translate<AccountKey>
  /**
   * Send one invite, when the gateway offers the write.
   * @param email - the address to invite, as typed.
   * @returns what the attempt established.
   */
  sendInvite: ((email: string) => Promise<UnieAiInviteResult>) | undefined
}

/**
 * Render the invite card.
 * @param props - the referral standing, section copy, and the send gesture.
 * @returns the card element tree.
 */
export function InviteCard({ invites, t, sendInvite }: InviteCardProps) {
  return (
    <section className={css.card}>
      {/* No heading and no reward paragraph here: the Invite friends page
          carries both above this card, and one topic named twice on one screen
          reads as two. */}
      <span className={css.badge}>{t('invite.reward')}</span>
      {invites === undefined
        ? <p className={css.note}>{t('invite.empty')}</p>
        : <Standing invites={invites} t={t} />}
      {sendInvite !== undefined && <InviteLauncher t={t} sendInvite={sendInvite} />}
    </section>
  )
}

/** The two figures and the list, each drawn only where the supplier reported it. */
function Standing({ invites, t }: { invites: UnieAiInvites; t: Translate<AccountKey> }) {
  const { credits, sentCount, sent } = invites
  // The count is drawn from the list when there is one, so the two can never
  // disagree on the same screen.
  const count = sent?.length ?? sentCount
  return (
    <>
      {credits !== undefined && <p className={css.note}>{t('invite.credits', { count: credits })}</p>}
      {count !== undefined && <p className={css.note}>{t('invite.sentCount', { count })}</p>}
      {sent !== undefined && sent.length > 0 && (
        <ul className={css.invites}>
          {sent.map(invite => <SentRow key={invite.inviteeEmail} invite={invite} t={t} />)}
        </ul>
      )}
      {count === 0 && <p className={css.note}>{t('invite.noneSent')}</p>}
    </>
  )
}

/** One sent invite: who, where it stands, when, and its own link. */
function SentRow({ invite, t }: { invite: UnieAiSentInvite; t: Translate<AccountKey> }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { clearTimeout(timer.current) }, [])
  const url = invite.url
  return (
    <li className={css.inviteRow}>
      <span className={css.inviteWho}>{invite.inviteeEmail}</span>
      <span className={css.inviteMeta}>
        {[invite.status, invite.sentAt].filter(part => part !== undefined).join(' · ')}
      </span>
      {url !== undefined && (
        <Button
          variant="outline"
          size="sm"
          icon={result === 'copied' ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          onClick={() => {
            void writeClipboard(url).then((ok) => {
              setResult(ok ? 'copied' : 'failed')
              clearTimeout(timer.current)
              timer.current = setTimeout(() => { setResult('idle') }, COPIED_MS)
            })
          }}
        >
          {result === 'copied' ? t('invite.copied') : t('invite.copy')}
        </Button>
      )}
      {result === 'failed' && <p className={css.failure}>{t('invite.copyFailed')}</p>}
    </li>
  )
}

/** The trigger that opens the compose dialog, and the dialog it opens. */
function InviteLauncher({ t, sendInvite }: {
  t: Translate<AccountKey>
  sendInvite: (email: string) => Promise<UnieAiInviteResult>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" className={css.inviteOpen} onClick={() => { setOpen(true) }}>
        {t('invite.compose')}
      </Button>
      <InviteFriendDialog
        open={open}
        t={t}
        sendInvite={sendInvite}
        onClose={() => { setOpen(false) }}
      />
    </>
  )
}
