/**
 * The Account settings section — the first of the three pages this package
 * registers, and the one the UnieAI web product's settings page opens with:
 * the identity mark, the display name and plan, the five-cell activity strip,
 * the Token Activity heatmap, and the session itself (which address it belongs
 * to, and the way out of it).
 *
 * Editing lives in that header rather than in a card under it. The mark IS the
 * change-avatar trigger and the name turns into a field in place, so the name
 * and the photo appear exactly once on the page — see {@link ProfileHeader}.
 *
 * Remaining usage and invites are NOT here. They are their own settings pages
 * (`unieai-usage`, `unieai-invite`), because each is a topic a reader comes to
 * the panel for on its own and the panel's nav is what tells them so; an
 * anchor into the middle of one long page left the nav pointing at a heading
 * the reader had already scrolled past.
 *
 * Everything model- or org-facing stays out by construction: this component
 * reads only {@link UnieAiAccount}, and that contract carries no organisation,
 * seat, audit, SSO, or billing field for it to render.
 *
 * Appearance and language are NOT here either. Both already exist as
 * General-section rows owned by their own features (`ui-theme` → Appearance,
 * `locale` → Language); duplicating them would give one preference two
 * controls, so the section points at them in one line instead.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the settings slot declarations (the `settings.section` entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  UnieAiAccount, UnieAiAccountState, UnieAiProfilePatch, UnieAiProfileSaveResult,
} from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import { AccountOverview } from './AccountOverview.tsx'
import { NotConnectedCard } from './NotConnectedCard.tsx'
import { TokenActivity } from './TokenActivity.tsx'
import css from './AccountSection.module.css'

/** Injected business face of the Account section (slot `inject`). */
export interface AccountSectionInjected {
  hooks: {
    /** Account state, bound by the UI renderer as useAccount. */
    account: AccountSource
    /**
     * Active locale id, bound as useActiveLocale. The heatmap's month ruler is
     * the one string on this page neither the supplier nor the dictionary can
     * write — there are twelve of them per language — so it is named from
     * locale data, and that needs to know which language is being read.
     */
    activeLocale: HostObservable<string>
  }
  /** Start or retry the device-code sign-in. */
  signIn: () => void
  /** Drop the local session. */
  signOut: () => void
  /**
   * Store a display-name or avatar change.
   * @param patch - the change to store.
   * @returns whether the supplier stored it.
   */
  saveProfile: (patch: UnieAiProfilePatch) => Promise<UnieAiProfileSaveResult>
}

/** Full component props: runtime share + locale seat + injected face. */
export type AccountSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.account'>
  & InjectFace<AccountSectionInjected>

/**
 * Render the Account section.
 * @param props - composed slot props.
 * @returns the section element tree.
 */
export function AccountSection(props: AccountSectionComponentProps) {
  const { t, useAccount, useActiveLocale, signIn, signOut, saveProfile } = props
  const state: UnieAiAccountState = useAccount(snapshot => snapshot)
  const locale = useActiveLocale(active => active)
  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      <AccountOverview
        account={state.status === 'signed-in' ? state.account : undefined}
        t={t}
        saveProfile={saveProfile}
      />
      {state.status === 'signed-in' && state.account.activity !== undefined && (
        <TokenActivity daily={state.account.activity.daily} locale={locale} t={t} />
      )}
      {state.status === 'signed-in'
        ? <SessionCard account={state.account} t={t} signOut={signOut} />
        : <NotConnectedCard state={state} t={t} signIn={signIn} />}
      {/* One line, not a second copy of the controls: the preferences live in
          the General section, owned by ui-theme and locale. */}
      <p className={css.note}>{t('general.hint')}</p>
    </div>
  )
}

/**
 * The session card under the header: the address this session belongs to, the
 * way out of it, and where the name and photo above actually live. It carries
 * no title of its own — the page is already called Account — and it repeats
 * neither the name nor the photo, both of which are edited in the header.
 */
function SessionCard({ account, t, signOut }: {
  account: UnieAiAccount
  t: AccountSectionComponentProps['t']
  signOut: () => void
}) {
  return (
    <section className={css.card}>
      <div className={css.identity}>
        <span className={css.identityText}>
          <span className={css.email}>{t('profile.email', { email: account.identity.email })}</span>
        </span>
        <span className={css.identityAction}>
          <Button variant="outline" size="sm" onClick={signOut}>{t('profile.signOut')}</Button>
        </span>
      </div>
      <p className={css.note}>{t('profile.managed')}</p>
    </section>
  )
}
