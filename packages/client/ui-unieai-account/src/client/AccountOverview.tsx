/**
 * The Overview header of the Account section, in the arrangement the UnieAI
 * web product's settings page uses: a 64px identity mark, the display name,
 * the plan under it, and the five-cell activity strip.
 *
 * The header is also the profile EDITOR — see {@link ProfileHeader}. There is
 * no second card printing the same name and the same photo below it: one fact,
 * one place on the page, and that place is where it is changed.
 *
 * The second line is the plan and only the plan. The web product prints
 * `@handle · Plan` there; this product has no handle — no column, no route,
 * nothing to report one — and the address that used to stand in for it already
 * has a home in the session card below, so standing it in here printed the
 * same address twice on one page.
 *
 * The strip is drawn in every state, because it is what this screen IS — but
 * a cell whose figure the supplier has not reported reads as unknown, never
 * as zero. With no gateway composed there is no account at all, so every cell
 * is unknown and the name says nobody is signed in.
 */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  UnieAiAccount, UnieAiActivityStatId, UnieAiProfilePatch, UnieAiProfileSaveResult,
} from '../account-contract.ts'
import { ACTIVITY_STAT_IDS } from '../account-contract.ts'
import type { AccountKey } from './locales.ts'
import { ProfileHeader } from './ProfileHeader.tsx'
import css from './AccountSection.module.css'

/** What an unreported figure prints: absent, not zero. */
const UNKNOWN = '—'

/** Copy key of each strip cell, in the strip's own order. */
const STAT_LABELS: Readonly<Record<UnieAiActivityStatId, AccountKey>> = {
  'total-tokens': 'stat.totalTokens',
  'peak-tokens': 'stat.peakTokens',
  'longest-task': 'stat.longestTask',
  'current-streak': 'stat.currentStreak',
  'longest-streak': 'stat.longestStreak',
}

/** Props of the Overview header. */
export interface AccountOverviewProps {
  /** The account, when one is loaded; absent in every other state. */
  account: UnieAiAccount | undefined
  /** Section copy. */
  t: Translate<AccountKey>
  /**
   * Store a name or avatar change. Only a loaded account has anything to
   * store, so the header edits nothing in the other states.
   * @param patch - the change to store.
   * @returns whether the supplier stored it.
   */
  saveProfile: (patch: UnieAiProfilePatch) => Promise<UnieAiProfileSaveResult>
}

/**
 * Render the identity header and the activity strip.
 * @param props - the account (when loaded), section copy, and the save.
 * @returns the overview element tree.
 */
export function AccountOverview({ account, t, saveProfile }: AccountOverviewProps) {
  return (
    <>
      {account === undefined
        ? (
          // Nobody is signed in, so there is nothing to edit and no control is
          // drawn: an avatar trigger over an absent account would open a
          // dialog whose Save has no account to reach.
          <div className={css.overview}>
            <div className={css.mark}>
              <span className={css.overviewMark} aria-hidden>
                <IconUserOutline16 className={css.overviewGlyph} size={26} />
              </span>
            </div>
            <div className={css.overviewText}>
              <span className={css.overviewName}>{t('row.signedOut')}</span>
            </div>
          </div>
        )
        : (
          <ProfileHeader
            identity={account.identity}
            // Already localized by the supplier, so it is printed rather than
            // passed through a copy key that would only wrap it in nothing.
            planLabel={account.plan.label}
            t={t}
            saveProfile={saveProfile}
          />
        )}
      <dl className={css.stats}>
        {ACTIVITY_STAT_IDS.map(id => (
          <div className={css.stat} key={id}>
            <dt className={css.statLabel}>{t(STAT_LABELS[id])}</dt>
            <dd className={css.statValue}>{account?.activity?.stats[id] ?? UNKNOWN}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
