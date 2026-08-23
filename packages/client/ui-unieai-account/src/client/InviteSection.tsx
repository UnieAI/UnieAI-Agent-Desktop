/**
 * The Invite friends settings section: the account's referral standing and the
 * one write the product actually offers on it. A page of its own, for the same
 * reason usage is one — inviting someone is a task, not a paragraph at the
 * bottom of the account page.
 *
 * Signed out it draws the not-connected card rather than leaving the nav row
 * pointing at a blank page or removing the row entirely; the reasoning is
 * written out in {@link UsageSection}, and the two pages answer it the same
 * way on purpose.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: the settings slot declarations (the `settings.section` entry).
import type {} from '@unieai/uad-client-ui-settings/client'
import type { UnieAiAccountState, UnieAiInviteResult } from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import { InviteCard } from './InviteCard.tsx'
import { NotConnectedCard } from './NotConnectedCard.tsx'
import css from './AccountSection.module.css'

/** Injected business face of the invite section (slot `inject`). */
export interface InviteSectionInjected {
  hooks: {
    /** Account state, bound by the UI renderer as useAccount. */
    account: AccountSource
  }
  /** Start or retry the device-code sign-in. */
  signIn: () => void
  /**
   * Invite one address, when the composed gateway offers the write.
   * @param email - the address to invite, as typed.
   * @returns what the attempt established.
   */
  sendInvite: ((email: string) => Promise<UnieAiInviteResult>) | undefined
}

/** Full component props: runtime share + locale seat + injected face. */
export type InviteSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.account'>
  & InjectFace<InviteSectionInjected>

/**
 * Render the invite section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function InviteSection(props: InviteSectionComponentProps) {
  const { t, useAccount, signIn, sendInvite } = props
  const state: UnieAiAccountState = useAccount(snapshot => snapshot)
  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('invite.title')}</h2>
      {/* The product's own line about what an invite earns; it introduces the
          page here rather than being repeated inside the card. */}
      <p className={css.intro}>{t('invite.body')}</p>
      {state.status === 'signed-in'
        ? <InviteCard invites={state.account.invites} t={t} sendInvite={sendInvite} />
        : <NotConnectedCard state={state} t={t} signIn={signIn} />}
    </div>
  )
}
