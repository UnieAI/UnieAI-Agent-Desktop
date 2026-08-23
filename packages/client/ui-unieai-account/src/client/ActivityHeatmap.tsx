/**
 * The Token Activity heatmap: 53 weeks of token usage as a contribution-style
 * grid, one column per week, one cell per day, in the arrangement the UnieAI
 * web product's own profile page uses.
 *
 * Two things are deliberately not the reference's:
 *
 *  - The grid is built in UTC. The supplier keys its series by UTC day, and a
 *    grid laid out in the reader's zone would put a day's tokens under the
 *    neighbouring cell for every reader west of Greenwich.
 *  - There is no `date-fns`. The whole of the date work here is week alignment
 *    and a `YYYY-MM-DD` key, which is a dozen lines of UTC arithmetic; the one
 *    piece that genuinely needs locale data — the short month name — asks
 *    `Intl` for it and falls back to the month's number when a runtime has no
 *    data for that language.
 */
import { useMemo } from 'react'
import clsx from 'clsx'
import type { UnieAiActivityDay } from '../account-contract.ts'
import { groupDigits } from '../account-contract.ts'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountKey } from './locales.ts'
import css from './ActivityHeatmap.module.css'

/** How the cells are coloured. */
export type HeatmapMode = 'daily' | 'weekly' | 'cumulative'

/** The toggle's order, which is the web product's order. */
export const HEATMAP_MODES: readonly HeatmapMode[] = ['daily', 'weekly', 'cumulative']

/** One day in milliseconds; every date step here is one of these. */
const DAY_MS = 86_400_000

/** Weeks run Sunday to Saturday, as the reference grid does. */
const WEEKS = 53

/** Cell shade classes, level 0 (no usage) through level 4 (the top quartile). */
const LEVELS = [css.level0, css.level1, css.level2, css.level3, css.level4] as const

/** Props of the heatmap. */
export interface ActivityHeatmapProps {
  /** Days that recorded usage, ascending; days with none are absent. */
  daily: readonly UnieAiActivityDay[]
  /** Which quantity colours a cell. */
  mode: HeatmapMode
  /** Active locale id, which names the months under the grid. */
  locale: string
  /** Section copy. */
  t: Translate<AccountKey>
}

/** One rendered cell. */
interface Cell {
  /** The day, as `YYYY-MM-DD`. */
  key: string
  /** That day's tokens, whatever the mode colours by. */
  tokens: number
  /** Shade step, 0-4. */
  level: number
}

/** UTC midnight of an instant, as milliseconds. */
const utcDay = (at: number): number => {
  const when = new Date(at)
  return Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate())
}

/** The `YYYY-MM-DD` key of a UTC day, which is the supplier's own key format. */
function dayKey(at: number): string {
  const when = new Date(at)
  const month = (when.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${String(when.getUTCFullYear())}-${month}-${when.getUTCDate().toString().padStart(2, '0')}`
}

/**
 * Map a value onto a 0-4 shade using quartiles of the non-zero values, so the
 * ramp describes this account's own distribution rather than an absolute scale
 * nobody set.
 * @param values - every value the grid will colour.
 * @returns the shade for one value; zero and below is always the empty shade.
 */
function makeLeveler(values: readonly number[]): (value: number) => number {
  const nonZero = values.filter(value => value > 0).sort((a, b) => a - b)
  if (nonZero.length === 0) return () => 0
  const at = (share: number): number =>
    nonZero[Math.min(nonZero.length - 1, Math.floor(share * nonZero.length))] ?? 0
  const first = at(0.25)
  const second = at(0.5)
  const third = at(0.75)
  return (value) => {
    if (value <= 0) return 0
    if (value <= first) return 1
    if (value <= second) return 2
    if (value <= third) return 3
    return 4
  }
}

/**
 * Name one month in the reader's language.
 * @param at - a UTC day inside the month.
 * @param locale - the active locale id.
 * @returns the short month name, or its number where no locale data exists.
 */
function monthName(at: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(at))
  } catch {
    return String(new Date(at).getUTCMonth() + 1)
  }
}

/**
 * Build the week columns and the month labels under them.
 * @param daily - the reported series.
 * @param mode - which quantity colours a cell.
 * @param locale - the active locale id.
 * @param now - the instant the window ends in; a parameter so a test can pin it.
 * @returns the columns, and one label slot per column (empty where the month
 * did not change).
 */
export function buildHeatmap(
  daily: readonly UnieAiActivityDay[],
  mode: HeatmapMode,
  locale: string,
  now: number,
): { columns: Cell[][]; monthLabels: string[] } {
  const today = utcDay(now)
  // A whole-week window: forward to the Saturday of this week, back to the
  // Sunday of the week 53 weeks ago, so every column holds exactly seven days.
  const end = today + (6 - new Date(today).getUTCDay()) * DAY_MS
  const firstDay = today - (WEEKS * 7 - 1) * DAY_MS
  const start = firstDay - new Date(firstDay).getUTCDay() * DAY_MS

  const reported = new Map<string, number>()
  for (const day of daily) reported.set(day.date, day.tokens)
  const tokensOn = (at: number): number => reported.get(dayKey(at)) ?? 0

  const weeks: number[][] = []
  for (let at = start; at <= end; at += 7 * DAY_MS) {
    const week: number[] = []
    for (let offset = 0; offset < 7; offset += 1) week.push(at + offset * DAY_MS)
    weeks.push(week)
  }

  const grand = weeks.reduce(
    (sum, week) => week.reduce((inner, at) => inner + tokensOn(at), sum),
    0,
  )
  const weekSums = weeks.map(week => week.reduce((sum, at) => sum + tokensOn(at), 0))
  // The cumulative mode colours by progress through the grand total rather
  // than by distribution, so its thresholds are even fifths rather than
  // quartiles — the ramp is meant to read as "how far through the year".
  const running = new Map<string, number>()
  let accumulated = 0
  for (const week of weeks) {
    for (const at of week) {
      accumulated += tokensOn(at)
      running.set(dayKey(at), accumulated)
    }
  }
  const cumulativeLevel = (value: number): number => {
    if (grand <= 0 || value <= 0) return 0
    const share = value / grand
    if (share <= 0.2) return 1
    if (share <= 0.4) return 2
    if (share <= 0.6) return 3
    return 4
  }
  const dailyLeveler = makeLeveler(weeks.flatMap(week => week.map(tokensOn)))
  const weeklyLeveler = makeLeveler(weekSums)

  const columns = weeks.map((week, index) => week.map((at) => {
    const key = dayKey(at)
    if (mode === 'weekly') {
      const sum = weekSums[index] ?? 0
      return { key, tokens: sum, level: weeklyLeveler(sum) }
    }
    if (mode === 'cumulative') {
      const sum = running.get(key) ?? 0
      return { key, tokens: sum, level: cumulativeLevel(sum) }
    }
    const tokens = tokensOn(at)
    return { key, tokens, level: dailyLeveler(tokens) }
  }))

  // A label sits under the first column of each month, so the row reads as a
  // ruler rather than as a repeated word.
  let previousMonth = -1
  const monthLabels = weeks.map((week) => {
    const first = week[0] ?? start
    const month = new Date(first).getUTCMonth()
    if (month === previousMonth) return ''
    previousMonth = month
    return monthName(first, locale)
  })

  return { columns, monthLabels }
}

/**
 * Render the heatmap.
 * @param props - the series, the mode, the locale, and section copy.
 * @returns the grid element tree.
 */
export function ActivityHeatmap({ daily, mode, locale, t }: ActivityHeatmapProps) {
  const { columns, monthLabels } = useMemo(
    () => buildHeatmap(daily, mode, locale, Date.now()),
    [daily, mode, locale],
  )
  return (
    <div className={css.heatmap}>
      <div className={css.grid}>
        {columns.map((week, index) => (
          <div className={css.week} key={week[0]?.key ?? index}>
            {week.map(cell => (
              <div
                key={cell.key}
                className={clsx(css.cell, LEVELS[cell.level])}
                title={t('activity.cell', { date: cell.key, tokens: groupDigits(cell.tokens) })}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Same flex ratio as the columns above, so a label stays under the week
          it names however wide the panel gets. */}
      <div className={css.months} aria-hidden>
        {monthLabels.map((label, index) => (
          <span className={css.month} key={columns[index]?.[0]?.key ?? index}>{label}</span>
        ))}
      </div>
    </div>
  )
}
