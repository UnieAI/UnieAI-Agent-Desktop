/**
 * Reads the signed-in account's personal activity from the web product's
 * desktop BFF.
 *
 * Same seam as {@link ./account.ts}, for the same reason: the API key that
 * authenticates `/api/desktop/*` lives in the gate's session table and must
 * not reach a page. The browser asks the host, the host asks the product.
 *
 * Nothing here derives a figure. What "total tokens" means, which usage counts
 * as personal, and how a streak is measured are the product's decisions
 * (`lib/desktop/stats.ts`); this module forwards the numbers and drops
 * anything it cannot read as one. A call that fails yields `undefined` rather
 * than a zeroed record — an account with no activity and a statistics read
 * that did not happen must never render the same, because zeroes are a claim
 * and an error is not one.
 */

/** One day's token total, exactly as the product reports it. */
export interface DesktopDailyPoint {
  /** `YYYY-MM-DD`, UTC. */
  date: string
  /** Tokens attributed to that day. */
  tokens: number
}

/** The account's personal activity: five figures and the series behind them. */
export interface DesktopStats {
  /** All-time personal tokens, organisation usage excluded. */
  totalTokens: number
  /** Largest single-day personal total inside the product's window. */
  peakDayTokens: number
  /** Longest single task, in whole minutes. */
  longestTaskMinutes: number
  /** Consecutive days of usage ending today or yesterday. */
  currentStreakDays: number
  /** Longest consecutive run inside the window. */
  longestStreakDays: number
  /** Days with usage, ascending; a day with none is absent, not zero. */
  daily: DesktopDailyPoint[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A reported count, or zero when this build cannot read one. */
const readCount = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0

/**
 * Narrow one reported day.
 *
 * A point with no date cannot be placed on a calendar, so it is dropped rather
 * than rendered against an invented day. The count falls back to zero because
 * a day the product listed at all is a day it recorded usage for; the missing
 * piece is the number, not the fact.
 * @param value - a candidate point object.
 * @returns the point, or undefined when the value is not one.
 */
function readDailyPoint(value: unknown): DesktopDailyPoint | undefined {
  if (!isRecord(value)) return undefined
  const date = value['date']
  if (typeof date !== 'string' || date === '') return undefined
  return { date, tokens: readCount(value['tokens']) }
}

/**
 * Read the account's activity statistics.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the statistics, or undefined when they could not be read — which
 * the caller reports as a failure rather than as an account with no activity.
 */
export async function fetchDesktopStats(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<DesktopStats | undefined> {
  const response = await fetch(`${baseUrl}/api/desktop/stats`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body)) return undefined
  // The series is the one field whose absence would be indistinguishable from
  // an empty year, so a body that does not carry a list at all is unreadable
  // rather than an account that has never worked a day.
  if (!Array.isArray(body['daily'])) return undefined
  const daily: DesktopDailyPoint[] = []
  for (const entry of body['daily']) {
    const point = readDailyPoint(entry)
    if (point !== undefined) daily.push(point)
  }
  return {
    totalTokens: readCount(body['totalTokens']),
    peakDayTokens: readCount(body['peakDayTokens']),
    longestTaskMinutes: readCount(body['longestTaskMinutes']),
    currentStreakDays: readCount(body['currentStreakDays']),
    longestStreakDays: readCount(body['longestStreakDays']),
    daily,
  }
}
