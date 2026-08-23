/**
 * Remaining usage: one meter per allowance the account reports. The section
 * shows what is LEFT (the web product's `{pct}% remaining` reading), so the
 * bar is drawn as the unspent share; an unmetered allowance has no bar at all
 * rather than a full one, which would read as "about to run out".
 *
 * The card carries no heading of its own: it is the whole body of the Regular
 * usage limits page, and that page's own title already says so. A second copy
 * of those three words is how one topic starts looking like two.
 *
 * Nothing here invents a number: an account that reports no allowances says
 * so in one line.
 */
import type { Translate } from '@unieai/uad-client-ui-slots'
import type { UnieAiUsageQuota } from '../account-contract.ts'
import { groupDigits, remainingPercent } from '../account-contract.ts'
import type { AccountKey } from './locales.ts'
import css from './AccountSection.module.css'

/** Props of the usage block. */
export interface UsageMetersProps {
  /** The allowances the supplier reported, in its own order. */
  usage: readonly UnieAiUsageQuota[]
  /** Section copy. */
  t: Translate<AccountKey>
}

/**
 * Render the usage-limits card.
 * @param props - the allowances and section copy.
 * @returns the card element tree.
 */
export function UsageMeters({ usage, t }: UsageMetersProps) {
  return (
    <section className={css.card}>
      {usage.length === 0
        ? <p className={css.note}>{t('usage.empty')}</p>
        : (
          <ul className={css.meters}>
            {usage.map(quota => <Meter key={quota.id} quota={quota} t={t} />)}
          </ul>
        )}
    </section>
  )
}

/**
 * The reset line for one allowance.
 *
 * The window length is the difference between a time that means nothing on its
 * own and a reading: `Resets at 2026-08-23 12:00` says when, `Resets every 5
 * hours · Next 2026-08-23 12:00` says how often — which is what a user
 * deciding whether to keep working actually needs. The instant alone is what
 * an allowance whose window length the supplier did not report still gets.
 * @param quota - the allowance.
 * @param t - section copy.
 * @returns the line to print beside the remaining share.
 */
function resetLine(quota: UnieAiUsageQuota, t: Translate<AccountKey>): string {
  const when = quota.resetsAt ?? ''
  return quota.windowHours === undefined
    ? t('usage.resetAt', { when })
    : t('usage.resetEvery', { hours: quota.windowHours, date: when })
}

/** One allowance: name, spent-of-included, remaining share, and reset time. */
function Meter({ quota, t }: { quota: UnieAiUsageQuota; t: Translate<AccountKey> }) {
  const remaining = remainingPercent(quota)
  return (
    <li className={css.meter}>
      <div className={css.meterHead}>
        <span>{quota.label}</span>
        <span className={css.meterAmount}>
          {quota.limit === null
            ? t('usage.unlimited')
            : `${groupDigits(quota.used)} / ${groupDigits(quota.limit)}`}
        </span>
      </div>
      {remaining !== null && (
        <div
          className={css.track}
          role="progressbar"
          aria-label={quota.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remaining}
          aria-valuetext={t('usage.remaining', { pct: remaining })}
        >
          <span className={css.fill} style={{ width: `${remaining}%` }} />
        </div>
      )}
      <div className={css.meterFoot}>
        <span>{remaining === null ? t('usage.unlimited') : t('usage.remaining', { pct: remaining })}</span>
        {quota.resetsAt !== undefined && <span>{resetLine(quota, t)}</span>}
      </div>
    </li>
  )
}
