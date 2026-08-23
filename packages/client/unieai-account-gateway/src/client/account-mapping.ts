/**
 * Turn one host account snapshot into the account the settings section reads.
 *
 * The mapping is total in one direction only: every field it writes comes from
 * a field the product reported. Where the product reported nothing, the
 * account carries nothing — no zeroed meter, no invented reset time, no
 * invite list, no activity figure — so an unknown figure keeps rendering as
 * unknown instead of as a fact.
 *
 * This is also where the five activity figures become readings. The account
 * contract makes the supplier format them because the five differ in unit, and
 * this package is that supplier: a count is grouped, a duration takes the
 * product's own hour and minute suffixes, a streak takes its day suffix. A
 * figure the product did not report is left out of the map entirely, so the
 * strip draws that cell as unknown rather than as `0`.
 */
import type {
  UnieAiAccount, UnieAiAccountState, UnieAiActivity, UnieAiActivityStats, UnieAiInvites,
  UnieAiSentInvite, UnieAiUsageQuota,
} from '@unieai/uad-client-ui-unieai-account/client'
import type { LocaleId } from '@unieai/uad-client-locale/client'
import type {
  HostAccountMeter, HostAccountResponse, HostAccountSnapshot, HostAccountStats, HostSentInvite,
} from './host-account.ts'
import {
  COPY, INVITE_STATES, METER_KEYS, METER_QUOTA_IDS,
  type GatewayCopy, type InviteState, type MeterKey,
} from './locales.ts'

/**
 * What the plan line shows for an account the product puts on no plan. The
 * contract requires a label, and the section already spells an unreported
 * figure this way, so the line reads as unknown rather than as a free tier
 * nobody granted.
 */
const UNKNOWN_PLAN = '—'

const pad = (value: number): string => value.toString().padStart(2, '0')

/**
 * Render a reset instant in the reader's own time zone.
 *
 * The result is deliberately numeric rather than an `Intl` rendering: the
 * account contract already avoids host `Intl` data because it differs between
 * a browser and a Node test run, and a reset time that reorders its fields
 * between the two is worse than one that reads the same everywhere.
 * @param resetAt - the ISO timestamp the product reported, or an empty string.
 * @returns `YYYY-MM-DD HH:mm` local, or undefined when no usable instant was
 * reported — the section then prints no reset line at all.
 */
export function formatResetTime(resetAt: string): string | undefined {
  const when = new Date(resetAt)
  if (Number.isNaN(when.getTime())) return undefined
  const date = `${String(when.getFullYear())}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
  return `${date} ${pad(when.getHours())}:${pad(when.getMinutes())}`
}

/**
 * Project one reported meter onto its allowance row.
 * @param key - the product's meter key.
 * @param meter - the figures reported for it.
 * @param copy - the active locale's copy.
 * @returns the allowance, carrying a reset time only when one was reported.
 */
function toQuota(key: MeterKey, meter: HostAccountMeter, copy: GatewayCopy): UnieAiUsageQuota {
  const resetsAt = formatResetTime(meter.resetAt)
  return {
    id: METER_QUOTA_IDS[key],
    label: copy.meters[key],
    used: meter.used,
    limit: meter.limit,
    ...(resetsAt === undefined ? {} : { resetsAt }),
    // No window is a window of zero hours on the wire, and zero hours is not a
    // window any allowance has. It is carried through as absent, so the reset
    // line says only when rather than claiming a cycle nobody set.
    ...(meter.windowHours > 0 ? { windowHours: meter.windowHours } : {}),
  }
}

/**
 * Group a count into thousands.
 *
 * Spelled out here rather than imported from the account contract, which
 * exports the same rule: a value import of the section's bundle would put it
 * in this plugin's synchronous module graph for one function (client bundle
 * purity gate).
 * @param value - a non-negative count.
 * @returns the grouped digits (`1234567` renders as `1,234,567`).
 */
function groupDigits(value: number): string {
  return Math.max(0, Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Render a task duration the way the product's own profile page renders it:
 * whole hours, then the remaining whole minutes, each with the product's own
 * unit suffix.
 * @param minutes - the duration in minutes.
 * @param copy - the active locale's copy.
 * @returns the reading (`2h 5m`).
 */
function formatDuration(minutes: number, copy: GatewayCopy): string {
  const whole = Math.max(0, minutes)
  const hours = Math.floor(whole / 60)
  return `${String(hours)}${copy.units.hour} ${String(Math.round(whole % 60))}${copy.units.minute}`
}

/**
 * Turn the reported figures into the five strip readings and the daily series.
 * @param stats - the figures the product reported.
 * @param copy - the active locale's copy.
 * @returns the activity, carrying only the figures that actually arrived.
 */
function toActivity(stats: HostAccountStats, copy: GatewayCopy): UnieAiActivity {
  const readings: UnieAiActivityStats = {
    ...(stats.totalTokens === undefined ? {} : { 'total-tokens': groupDigits(stats.totalTokens) }),
    ...(stats.peakDayTokens === undefined ? {} : { 'peak-tokens': groupDigits(stats.peakDayTokens) }),
    ...(stats.longestTaskMinutes === undefined
      ? {}
      : { 'longest-task': formatDuration(stats.longestTaskMinutes, copy) }),
    ...(stats.currentStreakDays === undefined
      ? {}
      : { 'current-streak': `${String(stats.currentStreakDays)}${copy.units.day}` }),
    ...(stats.longestStreakDays === undefined
      ? {}
      : { 'longest-streak': `${String(stats.longestStreakDays)}${copy.units.day}` }),
  }
  return { stats: readings, daily: stats.daily }
}

/** Whether a state name is one this build has words for. */
const isInviteState = (value: string): value is InviteState =>
  (INVITE_STATES as readonly string[]).includes(value)

/**
 * Project one listed invite onto its row.
 * @param invite - the row the product listed.
 * @param copy - the active locale's copy.
 * @returns the row, carrying only the parts the product actually reported. A
 * state this build cannot name is dropped rather than printed raw: an English
 * enum member is not a reading in any language.
 */
function toSentInvite(invite: HostSentInvite, copy: GatewayCopy): UnieAiSentInvite {
  const sentAt = formatResetTime(invite.createdAt)
  return {
    inviteeEmail: invite.inviteeEmail,
    ...(isInviteState(invite.status) ? { status: copy.inviteStates[invite.status] } : {}),
    ...(sentAt === undefined ? {} : { sentAt }),
    ...(invite.inviteUrl === '' ? {} : { url: invite.inviteUrl }),
  }
}

/**
 * Project the account's referral standing.
 * @param snapshot - the host's reading of the product.
 * @param copy - the active locale's copy.
 * @returns the standing, or undefined when the host reported no part of it —
 * which is what a deployment running no referral programme, and a referral
 * call that failed, both look like.
 */
function toInvites(snapshot: HostAccountSnapshot, copy: GatewayCopy): UnieAiInvites | undefined {
  const { inviteCredits, inviteCount, invites } = snapshot
  if (inviteCredits === undefined && inviteCount === undefined && invites === undefined) {
    return undefined
  }
  return {
    ...(inviteCredits === undefined ? {} : { credits: inviteCredits }),
    ...(inviteCount === undefined ? {} : { sentCount: inviteCount }),
    ...(invites === undefined ? {} : { sent: invites.map(invite => toSentInvite(invite, copy)) }),
  }
}

/**
 * Map the host snapshot onto the section's account.
 *
 * A meter key this build does not know is dropped rather than shown unlabelled:
 * naming an allowance is the product's job, and this package can only name the
 * ones it has words for.
 * @param snapshot - the host's reading of the product.
 * @param locale - the active locale, which selects the allowance names.
 * @returns the account the section renders.
 */
export function mapAccount(snapshot: HostAccountSnapshot, locale: LocaleId): UnieAiAccount {
  const copy = COPY[locale]
  const name = snapshot.user.name?.trim() ?? ''
  const invites = toInvites(snapshot, copy)
  return {
    // The name falls back to the address because the contract's display name
    // is required and the section prints it as the account's heading. The
    // avatar is carried only when the product stores one — an account with no
    // photo must reach the section with no `avatarUrl`, so it draws a monogram
    // rather than a broken image.
    identity: {
      displayName: name === '' ? snapshot.user.email : name,
      email: snapshot.user.email,
      ...(snapshot.user.avatarUrl === undefined ? {} : { avatarUrl: snapshot.user.avatarUrl }),
    },
    plan: { label: snapshot.plan?.name ?? UNKNOWN_PLAN },
    usage: METER_KEYS.flatMap((key) => {
      const meter = snapshot.usage[key]
      return meter === undefined ? [] : [toQuota(key, meter, copy)]
    }),
    ...(snapshot.stats === undefined ? {} : { activity: toActivity(snapshot.stats, copy) }),
    ...(invites === undefined ? {} : { invites }),
  }
}

/**
 * What one attempt to read `/auth/account` established: either an answer the
 * host gave, or the fact that it gave none this build could read.
 */
export type AccountReading =
  | HostAccountResponse
  /** The gate did not answer, or answered a body this build cannot read. */
  | { status: 'unreachable' }

/**
 * Project one reading onto the state the section subscribes to.
 * @param reading - the last reading, or undefined before the first attempt
 * finishes.
 * @param locale - the active locale, which selects the failure wording.
 * @returns the account state.
 */
export function projectState(
  reading: AccountReading | undefined,
  locale: LocaleId,
): UnieAiAccountState {
  // Before the first reading the desktop holds no account it can show. It is
  // not `unavailable`: this build composes a gateway, so signing in is a
  // gesture that does something, which is exactly what `signed-out` means.
  if (reading === undefined) return { status: 'signed-out' }
  switch (reading.status) {
    case 'signed-out':
      return { status: 'signed-out' }
    case 'failed':
      return { status: 'failed', message: COPY[locale].productUnavailable }
    case 'unreachable':
      return { status: 'failed', message: COPY[locale].hostUnreachable }
    case 'signed-in':
      return { status: 'signed-in', account: mapAccount(reading.snapshot, locale) }
  }
}
