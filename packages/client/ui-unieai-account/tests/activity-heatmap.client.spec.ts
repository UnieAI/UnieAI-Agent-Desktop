/**
 * The heatmap's arithmetic, which is the part of it a screenshot cannot check:
 * where a reported day lands in the grid, what each mode colours by, and what
 * an unreported day gets.
 *
 * The window is pinned rather than read from the clock. `2026-08-22` is a
 * Saturday, so the whole-week window ends on it and begins exactly 53 columns
 * earlier — the alignment the grid is supposed to produce, checked against a
 * date whose weekday is known rather than against whatever today happens to be.
 */
import { describe, expect, it } from 'vitest'
import { buildHeatmap } from '../src/client/ActivityHeatmap.tsx'

/** A Saturday, so the window is exactly 53 whole weeks. */
const NOW = Date.UTC(2026, 7, 22)

const keysOf = (columns: { key: string }[][]): string[] => columns.flat().map(cell => cell.key)

describe('buildHeatmap window', () => {
  it('lays out whole weeks, ending on the week that contains today', () => {
    const { columns } = buildHeatmap([], 'daily', 'en', NOW)
    expect(columns).toHaveLength(53)
    for (const week of columns) expect(week).toHaveLength(7)
    expect(columns[0]?.[0]?.key).toBe('2025-08-17')
    expect(columns.at(-1)?.at(-1)?.key).toBe('2026-08-22')
  })

  it('keys every cell by its UTC day, which is how the supplier keys the series', () => {
    const keys = keysOf(buildHeatmap([], 'daily', 'en', NOW).columns)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('2026-01-01')
    // Zero-padded, because the supplier's own keys are.
    expect(keys).toContain('2026-02-09')
  })

  it('names a month under the first column that reaches it, and leaves the rest blank', () => {
    const { monthLabels } = buildHeatmap([], 'daily', 'en', NOW)
    expect(monthLabels).toHaveLength(53)
    const named = monthLabels.filter(label => label !== '')
    // Thirteen months are touched by 53 weeks, and each is named once.
    expect(named).toHaveLength(13)
    expect(named[0]).toBe('Aug')
    expect(monthLabels[0]).toBe('Aug')
    expect(monthLabels[1]).toBe('')
  })

  it('falls back to the month number where a runtime has no data for the language', () => {
    const { monthLabels } = buildHeatmap([], 'daily', 'not a locale', NOW)
    expect(monthLabels.filter(label => label !== '')[0]).toBe('8')
  })
})

describe('buildHeatmap daily mode', () => {
  const daily = [
    { date: '2026-08-22', tokens: 4_000 },
    { date: '2026-08-20', tokens: 30 },
    { date: '2026-08-19', tokens: 10 },
    { date: '2026-08-18', tokens: 300 },
  ]

  it('puts a reported day on its own cell and leaves every other day empty', () => {
    const cells = buildHeatmap(daily, 'daily', 'en', NOW).columns.flat()
    const byKey = new Map(cells.map(cell => [cell.key, cell]))
    expect(byKey.get('2026-08-22')?.tokens).toBe(4_000)
    expect(byKey.get('2026-08-21')?.tokens).toBe(0)
    expect(byKey.get('2026-08-21')?.level).toBe(0)
  })

  it('ramps the reported days by their own quartiles, in order', () => {
    // Quartiles of the non-zero values, as the reference computes them: the
    // thresholds are values from the series itself and the comparison is
    // inclusive, so a handful of reported days occupies the low steps and the
    // top step is reached only once the series is long enough to have a
    // quartile above its own maximum. Reproduced rather than improved — two
    // dialects of the same grid would be worse than one that is coarse.
    const cells = buildHeatmap(daily, 'daily', 'en', NOW).columns.flat()
    const level = (key: string): number => cells.find(cell => cell.key === key)?.level ?? -1
    expect(level('2026-08-19')).toBe(1)
    expect(level('2026-08-18')).toBe(2)
    expect(level('2026-08-22')).toBe(3)
    expect(level('2026-08-19')).toBeLessThan(level('2026-08-18'))
    expect(level('2026-08-18')).toBeLessThan(level('2026-08-22'))
  })

  it('leaves every cell empty when nothing was reported, rather than inventing a scale', () => {
    const cells = buildHeatmap([], 'daily', 'en', NOW).columns.flat()
    expect(cells.every(cell => cell.level === 0)).toBe(true)
  })
})

describe('buildHeatmap weekly mode', () => {
  it('colours all seven cells of a week by that week\'s sum', () => {
    const { columns } = buildHeatmap([
      { date: '2026-08-17', tokens: 100 },
      { date: '2026-08-19', tokens: 200 },
    ], 'weekly', 'en', NOW)
    const last = columns.at(-1) ?? []
    expect(new Set(last.map(cell => cell.tokens))).toEqual(new Set([300]))
    // One column uniformly, at whatever step the week's own sum falls on —
    // the point of the mode is that a week reads as one block.
    expect(new Set(last.map(cell => cell.level)).size).toBe(1)
    expect(last[0]?.level).toBeGreaterThan(0)
    // A week with nothing in it stays empty, whatever the week beside it did.
    expect(columns[0]?.every(cell => cell.level === 0)).toBe(true)
  })
})

describe('buildHeatmap cumulative mode', () => {
  const daily = [
    { date: '2025-09-01', tokens: 100 },
    { date: '2026-03-01', tokens: 100 },
    { date: '2026-08-20', tokens: 100 },
  ]

  it('never falls, and reaches the top step by the end of a year with usage', () => {
    const cells = buildHeatmap(daily, 'cumulative', 'en', NOW).columns.flat()
    for (let index = 1; index < cells.length; index += 1) {
      expect(cells[index]?.tokens).toBeGreaterThanOrEqual(cells[index - 1]?.tokens ?? 0)
    }
    expect(cells.at(-1)?.tokens).toBe(300)
    expect(cells.at(-1)?.level).toBe(4)
    // Nothing has happened yet at the start of the window.
    expect(cells[0]?.level).toBe(0)
  })

  it('stays empty for an account with no usage, rather than filling the whole year', () => {
    const cells = buildHeatmap([], 'cumulative', 'en', NOW).columns.flat()
    expect(cells.every(cell => cell.level === 0)).toBe(true)
  })
})

describe('buildHeatmap and days it was never told about', () => {
  it('ignores a reported day outside the window instead of misplacing it', () => {
    const { columns } = buildHeatmap([{ date: '2020-01-01', tokens: 9_999 }], 'daily', 'en', NOW)
    expect(columns.flat().every(cell => cell.tokens === 0)).toBe(true)
  })
})
