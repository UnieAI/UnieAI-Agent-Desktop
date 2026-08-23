/**
 * The not-connected card — three postures, and the difference between the
 * first two is the whole point: `unavailable` means no account gateway is
 * composed, so a Sign in button would do nothing and none is drawn;
 * `signed-out` means one is composed and holds no session, so signing in is
 * the screen's wanted action. `failed` names what went wrong and offers a
 * retry.
 *
 * There is no waiting-for-approval posture. The sign-in this product runs is a
 * device-code flow the host renders server-side at `/auth/login`, before any
 * client bundle exists: pressing Sign in navigates the browser out of the
 * single-page app, and the app that comes back is either signed in or not.
 * Nothing can observe the middle, so nothing draws it.
 */
import type { Translate } from '@unieai/uad-client-ui-slots'
import { Button } from '@unieai/uad-client-ui-primitives'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountKey } from './locales.ts'
import css from './AccountSection.module.css'

/** Props of the not-connected card. */
export interface NotConnectedCardProps {
  /** Any state other than `signed-in`. */
  state: Exclude<UnieAiAccountState, { status: 'signed-in' }>
  /** Section copy. */
  t: Translate<AccountKey>
  /** Start or retry the sign-in. */
  signIn: () => void
}

/**
 * Render the not-connected card for the current posture.
 * @param props - state, copy, and the sign-in gesture.
 * @returns the card element tree.
 */
export function NotConnectedCard({ state, t, signIn }: NotConnectedCardProps) {
  return (
    <section className={css.card}>
      <span className={css.eyebrow}>
        {state.status === 'failed' ? t('connect.failed') : t('connect.eyebrow')}
      </span>
      <p className={css.body}>
        {state.status === 'unavailable' ? t('connect.unavailable') : t('connect.body')}
      </p>
      {state.status === 'failed' && <p className={css.failure}>{state.message}</p>}
      {state.status !== 'unavailable' && (
        <div className={css.actions}>
          <Button variant="primary" onClick={signIn}>
            {state.status === 'failed' ? t('connect.retry') : t('connect.action')}
          </Button>
        </div>
      )}
    </section>
  )
}
