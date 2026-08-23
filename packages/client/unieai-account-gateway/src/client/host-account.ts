/**
 * The `/auth/account` wire format, restated on the browser side of that
 * process boundary, plus the reader that narrows one JSON body onto it.
 *
 * The host owns the same names in `@deepseek-ai/dsh-unieai-web-gate`; they are
 * declared again here rather than imported because this is a wire boundary,
 * not a same-process interface — a page may be served by a host that is one
 * deploy ahead or behind it, so every field is checked before it is believed.
 *
 * Nothing here repairs a missing figure. A meter that does not arrive is
 * absent, and an allowance the product reports as unmetered arrives as
 * `limit: null` and stays that way: an unmetered allowance and an exhausted
 * one must never reduce to the same number.
 */

/** One metered allowance exactly as the product reported it. */
export interface HostAccountMeter {
  /** Units consumed in the current window. */
  used: number
  /** Units included, or null when the allowance is unmetered. */
  limit: number | null
  /** ISO timestamp at which the window rolls over; empty when unreported. */
  resetAt: string
  /**
   * Length of the metering window in hours, or 0 when unreported. The host
   * spells an unreported window as 0 rather than omitting the field, and 0 is
   * not a window any allowance can have, so it is read here as "unreported"
   * and the allowance reaches the section with no window at all.
   */
  windowHours: number
}

/** One invite the product listed for this account. */
export interface HostSentInvite {
  /** The address that was invited. */
  inviteeEmail: string
  /** The product's own state name (`pending`, `joined`, `rewarded`). */
  status: string
  /** ISO timestamp the invite was created at; empty when unreported. */
  createdAt: string
  /** Absolute URL that accepts this one invite; empty when unreported. */
  inviteUrl: string
}

/**
 * The account's activity figures and the series behind the heatmap.
 *
 * Every figure is optional and none is defaulted. The product computes all six
 * together, so in practice they arrive together — but a host one deploy behind
 * this build reports a subset, and a figure that did not arrive has to render
 * as unknown rather than as an account that used nothing.
 */
export interface HostAccountStats {
  /** All-time personal tokens. */
  totalTokens?: number
  /** Largest single-day total inside the reported window. */
  peakDayTokens?: number
  /** Longest single task, in whole minutes. */
  longestTaskMinutes?: number
  /** Consecutive days of usage ending today or yesterday. */
  currentStreakDays?: number
  /** Longest consecutive run inside the window. */
  longestStreakDays?: number
  /** Days that recorded usage, ascending; days with none are absent, not zero. */
  daily: { date: string; tokens: number }[]
}

/** The account the host read from the product on this session's behalf. */
export interface HostAccountSnapshot {
  /**
   * Sign-in identity; `name` is null for an account that set none, and
   * `avatarUrl` — a `data:` URL, which is how the product stores an avatar —
   * is absent for an account with no photo. Absent is not the same as empty:
   * the section draws a monogram for the first and would draw a broken image
   * for the second.
   */
  user: { id: string; name: string | null; email: string; avatarUrl?: string }
  /** Plan as the product labels it; null when the account is on none. */
  plan: { key: string; name: string } | null
  /** Allowances by the product's own meter keys (`agentTurns`, `chatTokens`, ...). */
  usage: Record<string, HostAccountMeter>
  /** Referral credits banked but not yet spent; absent when the call failed. */
  inviteCredits?: number
  /** How many people this account has invited; absent when the call failed. */
  inviteCount?: number
  /**
   * The invites themselves. The product lists them and the host may or may not
   * forward the rows — it has always forwarded their count — so this is absent
   * on a host that reports only `inviteCount`, and the section then shows the
   * count without the list rather than an account that has invited nobody.
   */
  invites?: HostSentInvite[]
  /** Activity figures and the daily series; absent when the product reported none. */
  stats?: HostAccountStats
}

/** What `/auth/account` answers. */
export type HostAccountResponse =
  /** The browser holds no gate session. */
  | { status: 'signed-out' }
  /** A session exists and the product answered. */
  | { status: 'signed-in'; snapshot: HostAccountSnapshot }
  /**
   * A session exists and the product did not answer. The host also sends a
   * `message`, which is deliberately not read: it is an English diagnostic for
   * a direct caller, and only the browser knows the reader's language, so this
   * package supplies the text the section shows.
   */
  | { status: 'failed' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/**
 * Narrow one reported meter.
 * @param value - a candidate meter object.
 * @returns the meter, or undefined when the value does not carry a `used` count.
 */
function readMeter(value: unknown): HostAccountMeter | undefined {
  if (!isRecord(value)) return undefined
  const used = value['used']
  if (typeof used !== 'number') return undefined
  const limit = value['limit']
  const windowHours = value['windowHours']
  return {
    used,
    limit: typeof limit === 'number' ? limit : null,
    resetAt: readString(value['resetAt']),
    windowHours: typeof windowHours === 'number' ? windowHours : 0,
  }
}

/** Read one optional numeric figure, keeping an unreported one unreported. */
const readNumber = (value: unknown): { value: number } | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? { value } : undefined

/**
 * Narrow the reported activity figures and series.
 * @param value - a candidate stats object.
 * @returns the stats, or undefined when the host reported none. A figure that
 * is not a number is dropped rather than replaced with zero.
 */
function readStats(value: unknown): HostAccountStats | undefined {
  if (!isRecord(value)) return undefined
  const reported = value['daily']
  const daily: { date: string; tokens: number }[] = []
  if (Array.isArray(reported)) {
    for (const point of reported) {
      if (!isRecord(point)) continue
      const date = readString(point['date'])
      const tokens = point['tokens']
      if (date === '' || typeof tokens !== 'number') continue
      daily.push({ date, tokens })
    }
  }
  const total = readNumber(value['totalTokens'])
  const peak = readNumber(value['peakDayTokens'])
  const longestTask = readNumber(value['longestTaskMinutes'])
  const currentStreak = readNumber(value['currentStreakDays'])
  const longestStreak = readNumber(value['longestStreakDays'])
  return {
    ...(total === undefined ? {} : { totalTokens: total.value }),
    ...(peak === undefined ? {} : { peakDayTokens: peak.value }),
    ...(longestTask === undefined ? {} : { longestTaskMinutes: longestTask.value }),
    ...(currentStreak === undefined ? {} : { currentStreakDays: currentStreak.value }),
    ...(longestStreak === undefined ? {} : { longestStreakDays: longestStreak.value }),
    daily,
  }
}

/**
 * Narrow the reported invite list.
 * @param value - a candidate array of invite rows.
 * @returns the rows, or undefined when the host listed none. A row without an
 * address names nobody and is dropped.
 */
function readInvites(value: unknown): HostSentInvite[] | undefined {
  if (!Array.isArray(value)) return undefined
  const invites: HostSentInvite[] = []
  for (const row of value) {
    if (!isRecord(row)) continue
    const inviteeEmail = readString(row['inviteeEmail'])
    if (inviteeEmail === '') continue
    invites.push({
      inviteeEmail,
      status: readString(row['status']),
      createdAt: readString(row['createdAt']),
      inviteUrl: readString(row['inviteUrl']),
    })
  }
  return invites
}

/**
 * Narrow the account snapshot carried by a `signed-in` answer.
 * @param value - the answer's `snapshot` member.
 * @returns the snapshot, or undefined when it names no account.
 */
function readSnapshot(value: unknown): HostAccountSnapshot | undefined {
  if (!isRecord(value)) return undefined
  const user = isRecord(value['user']) ? value['user'] : undefined
  const id = readString(user?.['id'])
  if (id === '') return undefined
  const plan = isRecord(value['plan']) ? value['plan'] : undefined
  const planName = readString(plan?.['name'])
  const reported = isRecord(value['usage']) ? value['usage'] : {}
  const usage: Record<string, HostAccountMeter> = {}
  for (const [key, meter] of Object.entries(reported)) {
    const read = readMeter(meter)
    if (read !== undefined) usage[key] = read
  }
  const avatarUrl = user?.['avatarUrl']
  const inviteCredits = value['inviteCredits']
  const inviteCount = value['inviteCount']
  const invites = readInvites(value['invites'])
  const stats = readStats(value['stats'])
  return {
    user: {
      id,
      name: typeof user?.['name'] === 'string' ? user['name'] : null,
      email: readString(user?.['email']),
      ...(typeof avatarUrl === 'string' && avatarUrl !== '' ? { avatarUrl } : {}),
    },
    plan: planName === '' ? null : { key: readString(plan?.['key']), name: planName },
    usage,
    ...(typeof inviteCredits === 'number' ? { inviteCredits } : {}),
    ...(typeof inviteCount === 'number' ? { inviteCount } : {}),
    ...(invites === undefined ? {} : { invites }),
    ...(stats === undefined ? {} : { stats }),
  }
}

/**
 * Read one `/auth/account` body.
 * @param body - the parsed JSON body.
 * @returns the answer, or undefined when the body is not one this build knows
 * how to read — which the caller reports as a failure rather than as an
 * account with nothing in it.
 */
export function readAccountResponse(body: unknown): HostAccountResponse | undefined {
  if (!isRecord(body)) return undefined
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  if (body['status'] === 'failed') return { status: 'failed' }
  if (body['status'] !== 'signed-in') return undefined
  const snapshot = readSnapshot(body['snapshot'])
  return snapshot === undefined ? undefined : { status: 'signed-in', snapshot }
}
