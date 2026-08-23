/**
 * Reads the signed-in account's plan, usage, and referrals from the web
 * product's desktop BFF.
 *
 * This runs on the host, not in the browser, because the API key that
 * authenticates these calls lives in the gate's session table and must not
 * reach a page. The browser asks the host, the host asks the product.
 *
 * Nothing here interprets a number. The product owns what an allowance means,
 * what window it resets in, and what a plan is called; this module forwards
 * those values and drops only the fields the desktop has no use for. A call
 * that fails leaves its section absent rather than substituting a zero — a
 * missing quota and an exhausted one must never render the same.
 */

import { readSentInvites } from './invite.ts'
import type { SentInvite } from './invite.ts'
import { fetchAccountProfile } from './profile.ts'
import { fetchDesktopStats } from './stats.ts'
import type { DesktopStats } from './stats.ts'

/** One metered allowance, exactly as the product reports it. */
export interface AccountMeter {
  /** Units consumed in the current window. */
  used: number
  /** Units included, or null when the allowance is unmetered. */
  limit: number | null
  /** ISO timestamp at which the window rolls over. */
  resetAt: string
  /** Length of the window, in hours. */
  windowHours: number
}

/** The account snapshot the browser receives. */
export interface AccountSnapshot {
  /**
   * Sign-in identity. `avatarUrl` is the data URL the product stores for this
   * account, absent when it has none — the same value the web product's own
   * settings page draws, so both surfaces show one photo rather than two.
   */
  user: { id: string; name: string | null; email: string; avatarUrl?: string }
  /** Plan name as the product labels it; null when the account is on none. */
  plan: { key: string; name: string } | null
  /** Allowances by the product's own meter keys (`agentTurns`, `chatTokens`, ...). */
  usage: Record<string, AccountMeter>
  /** Referral credits banked but not yet spent; absent when the call failed. */
  inviteCredits?: number
  /** How many people this account has invited; absent when the call failed. */
  inviteCount?: number
  /**
   * The invites themselves, in the order the product listed them. Absent when
   * the referral call failed, and empty for an account that has invited
   * nobody — which are different facts, so they arrive differently.
   *
   * Each row is built field by field from {@link SentInvite}'s own members, so
   * a column the product adds later cannot widen what a page receives. The
   * redemption link is among them deliberately: it is what the person is meant
   * to send to someone else, not a credential this desktop is holding.
   */
  invites?: SentInvite[]
  /**
   * Personal activity — the five Overview figures and the day series behind
   * the heatmap — absent when the call failed.
   *
   * It rides on this snapshot rather than being left to `/auth/stats` alone
   * because the browser's account gateway reads one endpoint: a figure that
   * does not arrive here is a figure the Overview strip cannot draw, and it
   * would render an em-dash for an account that has plenty of activity.
   * `/auth/stats` still serves the same record for a caller that wants only
   * this part of it.
   */
  stats?: DesktopStats
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Read one meter, keeping the product's own distinction between an unmetered
 * allowance (`limit: null`) and one whose limit simply did not arrive.
 * @param value - a candidate meter object.
 * @returns the meter, or undefined when the value is not one.
 */
function readMeter(value: unknown): AccountMeter | undefined {
  if (!isRecord(value)) return undefined
  const used = value['used']
  const limit = value['limit']
  const resetAt = value['resetAt']
  const windowHours = value['windowHours']
  if (typeof used !== 'number') return undefined
  return {
    used,
    limit: typeof limit === 'number' ? limit : null,
    resetAt: typeof resetAt === 'string' ? resetAt : '',
    windowHours: typeof windowHours === 'number' ? windowHours : 0,
  }
}

async function getJson(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as unknown
  return isRecord(body) ? body : undefined
}

/**
 * Fetch the account snapshot.
 *
 * `me` is the only required call: without it there is no account to describe
 * and the caller is told so. Usage, referrals, the profile, and the activity
 * statistics are additive — a deployment that meters nothing, runs no referral
 * programme, or predates either route is a normal deployment, not a failed
 * read, so those sections are simply absent.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the requests.
 * @returns the snapshot, or undefined when the account could not be read.
 */
export async function fetchAccountSnapshot(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AccountSnapshot | undefined> {
  const [me, usage, invite, profile, activity] = await Promise.all([
    getJson(`${baseUrl}/api/desktop/me`, apiKey, signal),
    getJson(`${baseUrl}/api/desktop/usage`, apiKey, signal),
    getJson(`${baseUrl}/api/desktop/invite`, apiKey, signal),
    fetchAccountProfile(baseUrl, apiKey, signal),
    fetchDesktopStats(baseUrl, apiKey, signal),
  ])

  const user = isRecord(me?.['user']) ? me['user'] : undefined
  const id = typeof user?.['id'] === 'string' ? user['id'] : ''
  const email = typeof user?.['email'] === 'string' ? user['email'] : ''
  if (id === '') return undefined

  // The plan is reported by both calls; `usage` resolves it in the same query
  // that produced the allowances, so it is the one that cannot disagree with
  // them. `me` is the fallback for a deployment that meters nothing.
  const planSource = isRecord(usage?.['plan']) ? usage['plan'] : isRecord(me?.['plan']) ? me['plan'] : undefined
  const planName = typeof planSource?.['name'] === 'string' ? planSource['name'] : ''
  const planKey = typeof planSource?.['key'] === 'string' ? planSource['key'] : ''

  const meters: Record<string, AccountMeter> = {}
  const reported = isRecord(usage?.['usage']) ? usage['usage'] : undefined
  if (reported !== undefined) {
    for (const [key, value] of Object.entries(reported)) {
      const meter = readMeter(value)
      if (meter !== undefined) meters[key] = meter
    }
  }

  const referrals = invite?.['referrals']
  const invites = readSentInvites(referrals)
  const credits = invite?.['availableCredits']
  // The profile is the avatar's only source. `me` reports no photo, and the
  // desktop must not synthesize one from the address — an account with no
  // avatar draws a monogram, which is a different fact from a photo that
  // failed to load.
  const avatarUrl = profile?.image ?? undefined
  return {
    user: {
      id,
      name: typeof user?.['name'] === 'string' ? user['name'] : null,
      email,
      ...(avatarUrl === undefined ? {} : { avatarUrl }),
    },
    plan: planName === '' ? null : { key: planKey, name: planName },
    usage: meters,
    ...(typeof credits === 'number' ? { inviteCredits: credits } : {}),
    ...(Array.isArray(referrals) ? { inviteCount: referrals.length } : {}),
    ...(invites === undefined ? {} : { invites }),
    // Absent, never zeroed: a statistics read that failed and an account that
    // has never spent a token are different facts, and a surface that has to
    // choose what to show needs to be able to tell them apart.
    ...(activity === undefined ? {} : { stats: activity }),
  }
}
