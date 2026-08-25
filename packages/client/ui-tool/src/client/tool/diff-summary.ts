/**
 * The change-size suffix a collapsed tool row shows beside its file summary.
 *
 * Separate from the derivation it reads ({@link diffCardModel}, which lives in
 * the primitives package so both conversation packages can reach it): this is
 * the only piece that needs the conversation locale seat, and its only two
 * render sites are in this package.
 * @module
 */
import type { DiffCardModel } from '@unieai/uad-client-ui-primitives'
import type { TranslateNS } from '@unieai/uad-client-ui-slots'

/**
 * The collapsed row's change size: `+A -R` beside the file summary, so a reader
 * scanning the transcript learns how large a mutation is without expanding it.
 * Null for a call with no diff material — a still-running call whose tool
 * declared no call-time diff, and a failed mutation, which carries its failure
 * line in the summary slot instead and must never show counts for a change that
 * was not applied.
 * @param diff - the derived diff card, or null on the generic path.
 * @param t - the render site's conversation locale seat.
 * @returns the summary suffix text, or null when there is nothing to state.
 */
export function diffSummarySuffix(diff: DiffCardModel | null, t: TranslateNS<'conversation'>): string | null {
  if (diff === null) return null
  return t('row.diffStat', { added: diff.stats.added, removed: diff.stats.removed })
}
