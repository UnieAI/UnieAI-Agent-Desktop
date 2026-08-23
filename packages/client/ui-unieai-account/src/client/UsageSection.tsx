/**
 * The Regular usage limits settings section: how much of each allowance the
 * account has left, and when it resets. A page of its own rather than a block
 * inside Account, because "how much have I got left?" is a question a reader
 * opens the panel for on its own, and the panel's nav is what tells them the
 * answer has a place.
 *
 * Signed out, this page draws the same not-connected card the Account page
 * does instead of vanishing from the nav. Two reasons, and both are about the
 * reader rather than about tidiness: a nav whose rows appear and disappear
 * with the session moves the rows the reader was aiming at, and the account
 * menu's Usage row opens THIS id — a section that is not registered would fall
 * the panel back to whichever page happens to be first, so the row would
 * quietly open something else. The card says why the page is empty and offers
 * the one action that fills it.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings slot declarations (the `settings.section` entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import { NotConnectedCard } from './NotConnectedCard.tsx'
import { UsageMeters } from './UsageMeters.tsx'
import css from './AccountSection.module.css'

/** Injected business face of the usage section (slot `inject`). */
export interface UsageSectionInjected {
  hooks: {
    /** Account state, bound by the UI renderer as useAccount. */
    account: AccountSource
  }
  /** Start or retry the device-code sign-in. */
  signIn: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type UsageSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.account'>
  & InjectFace<UsageSectionInjected>

/**
 * Render the usage section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function UsageSection(props: UsageSectionComponentProps) {
  const { t, useAccount, signIn } = props
  const state: UnieAiAccountState = useAccount(snapshot => snapshot)
  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('usage.title')}</h2>
      <p className={css.intro}>{t('usage.intro')}</p>
      {state.status === 'signed-in'
        ? <UsageMeters usage={state.account.usage} t={t} />
        : <NotConnectedCard state={state} t={t} signIn={signIn} />}
    </div>
  )
}
