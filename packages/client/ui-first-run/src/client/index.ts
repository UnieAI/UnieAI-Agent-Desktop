/**
 * The first-run tour, browser half.
 *
 * Registers one overlay entry that shows four steps the first time somebody
 * opens this app, and never again. What it teaches is not the feature list: it
 * is the four things a person has to do in the first minute, in the order they
 * meet them.
 *
 * WHERE THE ANSWER IS KEPT. A durable setting, so a new window or a restart
 * does not ask again. Until the setting is readable the tour stays hidden —
 * `loading` is not `not seen`, and showing a tour to somebody who already
 * dismissed it, every launch, until their preferences arrive, is worse than
 * showing it a moment late.
 *
 * WHEN PREFERENCES CANNOT BE KEPT AT ALL (`unavailable`: a deployment that
 * holds them in memory) the tour is shown, because a person on a fresh
 * install is exactly who it is for, and it can always be skipped.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@unieai/uad-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@unieai/uad-client-locale/client'
// Type-only: the overlay seat is declared by ui-layout; cross-plugin
// collaboration goes through slots (client bundle purity gate).
import type {} from '@unieai/uad-client-ui-layout/client'
// Type-only: brings ctx.settingsScope, where the one durable answer is kept.
import type {} from '@unieai/uad-client-ui-settings/client'
import { FirstRunTour } from './FirstRunTour.tsx'
import type { FirstRunInjected } from './FirstRunTour.tsx'
import { en, ja, zh, zhTW } from './locales.ts'
import { FIRST_RUN_SEEN_FIELD, FIRST_RUN_SETTINGS_NAMESPACE } from '../first-run-settings.ts'
import type { FirstRunSettings } from '../first-run-settings.ts'

export type { FirstRunTourProps, FirstRunInjected } from './FirstRunTour.tsx'
export { TOUR, positionOf } from './tour.ts'
export type { TourPosition, TourStep } from './tour.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'first-run'


/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope']

/**
 * Register the tour.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { 'zh-CN': zh, 'zh-TW': zhTW, ja, en }),
    'ui-first-run: copy dictionaries',
  )

  const scope = ctx.settingsScope.bind<FirstRunSettings>({ namespace: FIRST_RUN_SETTINGS_NAMESPACE })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'first-run',
    // Above the surfaces it describes, so the mask covers them rather than
    // sitting under a panel this person has not been introduced to yet.
    order: -100,
    locale: NS,
    inject: (): FirstRunInjected => ({
      hooks: {
        seen: {
          getSnapshot: () => {
            const snapshot = scope.getSnapshot()
            // Hidden while the answer is still arriving; shown when there is
            // nowhere to keep one.
            if (snapshot.status === 'loading') return true
            return snapshot.value?.[FIRST_RUN_SEEN_FIELD] === true
          },
          subscribe: listener => scope.subscribe(listener),
        },
      },
      settle: () => { void scope.set(FIRST_RUN_SEEN_FIELD, true) },
    }),
  }, FirstRunTour))
}
