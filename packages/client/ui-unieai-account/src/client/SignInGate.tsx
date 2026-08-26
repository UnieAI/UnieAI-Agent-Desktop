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
 *
 * IT SENDS RATHER THAN ASKS. Signing in means leaving for the gate's
 * server-rendered `/auth/login`, and a card whose only button goes there is a
 * page whose sole purpose is to ask permission to show the next page. So a
 * signed-out window is sent straight there and shows only a blank veil while
 * the browser leaves.
 *
 * The card is still here, as the fallback for the two ways that send can fail
 * to land: a composition with no gateway, where `signIn` reaches nothing, and
 * a person who came back from the sign-in page without finishing. The first is
 * caught by a short timer, the second by a per-tab mark — and once either
 * happens this tab stops redirecting, because a window that bounces someone
 * back out every time they return is worse than a button.
 */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' seat).
import type {} from '@unieai/uad-client-ui-layout/client'
import type { UnieAiAccountState } from '../account-contract.ts'
import type { AccountSource } from './account-source.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge ('settings.account').
import type {} from './locales.ts'
import css from './SignInGate.module.css'

/**
 * Marks a tab that has already been sent to the sign-in page.
 *
 * Per TAB, not per document: the send is a navigation, so a module flag would
 * be gone by the time the person comes back and the tab would send them out
 * again. Cleared as soon as the account is anything other than signed out, so
 * a later sign-out redirects the way the first one did.
 */
const SENT_KEY = 'unieai.sign-in-gate.sent'

/**
 * How long the veil waits for a navigation before offering the card instead.
 *
 * The gate is on this machine, so a send that is going to happen has happened
 * long before this. What the timer catches is a send that cannot happen at all
 * — `signIn` is a no-op without a gateway — which would otherwise leave a
 * blank veil with nothing behind it.
 */
const STALL_MS = 1500

/** Whether this tab was already sent; a browser refusing storage says no. */
function alreadySent(): boolean {
  try {
    return sessionStorage.getItem(SENT_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Record or clear this tab's send.
 * @param sent - true after sending the browser to the sign-in page.
 */
function recordSent(sent: boolean): void {
  try {
    if (sent) sessionStorage.setItem(SENT_KEY, '1')
    else sessionStorage.removeItem(SENT_KEY)
  } catch {
    // Storage refused (private mode, disabled site data). The consequence is
    // one extra redirect on a return trip, not a broken gate.
  }
}

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
  const status = state.status
  const [offerCard, setOfferCard] = useState(false)
  // Held in a ref so the send depends on the STATUS alone: a face rebuilt
  // between renders would otherwise re-run the effect and send twice.
  const start = useRef(signIn)
  useEffect(() => { start.current = signIn })
  useEffect(() => {
    if (status !== 'signed-out') {
      recordSent(false)
      return
    }
    if (alreadySent()) {
      setOfferCard(true)
      return
    }
    recordSent(true)
    start.current()
    const timer = setTimeout(() => { setOfferCard(true) }, STALL_MS)
    return () => { clearTimeout(timer) }
  }, [status])
  if (status !== 'signed-out') return null
  // Blank while the browser leaves: the shell behind it can answer nothing,
  // and naming the destination in a card the person never chose to read is the
  // second page this change exists to remove.
  if (!offerCard) return <div className={css.root} aria-hidden />
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
