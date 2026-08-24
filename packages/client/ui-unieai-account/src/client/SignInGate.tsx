/**
 * The sign-in gate: what the application shows before it shows anything else.
 *
 * The product supplies the models, so a signed-out window is one where nothing
 * a person types can be answered. Opening onto the ordinary interface and
 * letting them discover that at the first message spends their attention on a
 * failure the application already knew about at boot.
 *
 * WHAT IT DOES NOT BLOCK. Only `signed-out` takes the screen. `unavailable` —
 * the host could not reach the product at all — passes straight through,
 * because the local agent does not need the product and a sign-in page nobody
 * can complete would be a locked door with no key. A `signing-in` window is
 * mid-flow and keeps its own progress.
 *
 * THERE IS NO SPINNER HERE. The startup read blocks the loader's own
 * quiescence (see `unieai-bootstrap`), and the shell's boot page — spinner and
 * all — stays up until that settles. By the time this component exists, the
 * answer is already known, so a second spinner would only be this surface
 * repeating a wait that has already finished.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' seat).
import type {} from '@unieai/uad-client-ui-layout/client'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import css from './SignInGate.module.css'

/** Registration-side dependencies of {@link SignInGate}. */
export interface SignInGateInjected {
  hooks: {
    /** The account read the whole application starts from. */
    account: AccountSource
  }
  /** Start or retry the device-code sign-in. */
  signIn: () => void
}

/** Slot owner props, the locale seat, and the feature's injected dependencies. */
export type SignInGateProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<'settings.account'>
  & InjectFace<SignInGateInjected>

/**
 * Take the screen while nobody is signed in.
 * @param props - the shell-overlay owner share and this feature's dependencies.
 * @returns the sign-in surface, or null once there is an account.
 */
export function SignInGate(props: SignInGateProps) {
  const { t, useAccount, signIn } = props
  const state: UnieAiAccountState = useAccount(snapshot => snapshot)
  if (state.status !== 'signed-out') return null
  return (
    <div className={css.root} role="dialog" aria-modal="true" aria-label={t('gate.title')}>
      <div className={css.card}>
        <div className={css.mark} aria-hidden>Rabi</div>
        <h1 className={css.title}>{t('gate.title')}</h1>
        <p className={css.body}>{t('gate.body')}</p>
        <button type="button" className={css.action} onClick={() => { signIn() }}>
          {t('gate.action')}
        </button>
      </div>
    </div>
  )
}
