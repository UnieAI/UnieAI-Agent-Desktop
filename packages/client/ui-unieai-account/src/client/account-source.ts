/**
 * Account state source for the section: a thin, observable adapter over the
 * optional {@link UnieAiAccountGateway}. It caches the gateway's snapshot so
 * repeated reads keep one reference between changes (the uSES contract the
 * render machinery relies on), and answers `unavailable` whenever no gateway
 * is connected — the state this build actually ships in.
 *
 * The adapter deliberately holds no account data of its own: business facts
 * live with whoever owns the token, and this object only mirrors them.
 */
import type {
  UnieAiAccountGateway, UnieAiAccountState, UnieAiInviteResult, UnieAiProfilePatch,
  UnieAiProfileSaveResult,
} from '../account-contract.ts'

/** The state with no gateway composed; one frozen reference, so reads are stable. */
export const UNAVAILABLE: UnieAiAccountState = Object.freeze({ status: 'unavailable' as const })

/** Observable account state plus the two gestures the section can perform. */
export class AccountSource {
  private gateway: UnieAiAccountGateway | undefined
  private offGateway: (() => void) | undefined
  private state: UnieAiAccountState = UNAVAILABLE
  private readonly listeners = new Set<() => void>()

  /**
   * @param gateway - the supplier, when one is composed; omitted leaves the
   * source permanently `unavailable`.
   */
  constructor(gateway?: UnieAiAccountGateway) {
    if (gateway === undefined) return
    this.attach(gateway)
  }

  /**
   * Adopt a gateway that was not available when this source was constructed.
   *
   * Plugin activation order is not constrained, so a gateway registered by
   * another package can arrive after this one's `apply` has already read an
   * empty service store. Without this the section would stay `unavailable` —
   * reporting "this build ships no sign-in" — while a live gateway sat beside
   * it already fetching the account. Attaching twice is a no-op, so a service
   * event that fires more than once cannot stack subscriptions.
   * @param gateway - the supplier to mirror.
   */
  attach(gateway: UnieAiAccountGateway): void {
    if (this.gateway === gateway) return
    this.offGateway?.()
    this.gateway = gateway
    this.offGateway = gateway.subscribe(() => { this.adopt() })
    this.adopt()
  }

  /**
   * Read the current state.
   * @returns the cached state; the same reference until the gateway moves.
   */
  getSnapshot(): UnieAiAccountState {
    return this.state
  }

  /**
   * Subscribe to state changes.
   * @param listener - called after every adopted change.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Begin or retry the device-code sign-in; a no-op without a gateway. */
  signIn(): void {
    this.gateway?.signIn()
  }

  /** Drop the session; a no-op without a gateway. */
  signOut(): void {
    this.gateway?.signOut()
  }

  /**
   * Store a profile change through the gateway.
   *
   * With no gateway composed there is nothing to write to, and the result says
   * so rather than reporting a save that never left the page.
   * @param patch - the change to store.
   * @returns what the attempt established.
   */
  async saveProfile(patch: UnieAiProfilePatch): Promise<UnieAiProfileSaveResult> {
    const gateway = this.gateway
    if (gateway === undefined) return { status: 'failed' }
    return await gateway.saveProfile(patch)
  }

  /**
   * Invite one address through the gateway.
   *
   * The gateway is read at call time rather than captured when the section's
   * injected face was built: that face is built once per entry, and cordis
   * activation order lets a gateway arrive after it. A composition whose
   * supplier exposes reads only answers `unsupported`, which is a different
   * fact from an invite that was refused.
   * @param email - the address to invite, as typed.
   * @returns what the attempt established.
   */
  async sendInvite(email: string): Promise<UnieAiInviteResult> {
    const gateway = this.gateway
    if (gateway?.sendInvite === undefined) return { status: 'unsupported' }
    return await gateway.sendInvite(email)
  }

  /** Release the gateway subscription (plugin teardown / HMR). */
  dispose(): void {
    this.offGateway?.()
    this.offGateway = undefined
    this.listeners.clear()
  }

  /** Re-read the gateway and notify subscribers when the state moved. */
  private adopt(): void {
    const next = this.gateway?.getSnapshot() ?? UNAVAILABLE
    if (next === this.state) return
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
