/**
 * The `unieaiAccount` gateway: the Provider role of the account seam, over the
 * host gate's `/auth/*` routes.
 *
 * It owns no credential. The gate's session cookie is `HttpOnly`, so this
 * object cannot read it and cannot forward it anywhere; every request it makes
 * is a same-origin request to the host, and the API key the host uses to reach
 * the product never crosses back into the page.
 *
 * Two gestures leave the single-page app on purpose. Sign-in is a device-code
 * flow the gate renders server-side at `/auth/login`, before any client bundle
 * exists, so it cannot happen inside the app; sign-out drops a cookie the app
 * cannot see, so the document has to be reloaded for the new state to hold.
 * Because sign-in leaves, there is no state between signed-out and signed-in
 * for this object to publish, and the contract carries none.
 */
import type {
  UnieAiAccountGateway, UnieAiAccountState, UnieAiInviteRefusal, UnieAiInviteResult,
  UnieAiProfilePatch, UnieAiProfileSaveResult,
} from '@unieai/uad-client-ui-unieai-account/client'
import type { LocaleId } from '@unieai/uad-client-locale/client'
// Type-only: the startup answer's contract. Cross-plugin collaboration goes
// through services, never a value import (client bundle purity gate).
import type { UnieAiBootstrap } from '@unieai/uad-client-unieai-bootstrap/client'
import { projectState, type AccountReading } from './account-mapping.ts'
import { readAccountResponse } from './host-account.ts'
import { readInviteResponse, type InviteSendBody } from './host-invite.ts'
import { readProfileResponse, type ProfileSaveBody } from './host-profile.ts'

/** Route the browser reads the account from. */
const ACCOUNT_PATH = '/auth/account'
/** Route the browser reads and writes the profile through. */
const PROFILE_PATH = '/auth/profile'
/** The gate's server-rendered device-code page. */
const LOGIN_PATH = '/auth/login'
/** Route that drops the gate session. */
const LOGOUT_PATH = '/auth/logout'
/** Route one invite is sent through. */
const INVITE_PATH = '/auth/invite'

/**
 * The product's own refusal identifiers, as the section spells them.
 *
 * The host forwards the product's identifier verbatim — the same discipline
 * the gate already uses for a refused provider — so the translation between
 * the two vocabularies happens exactly here, once. An identifier absent from
 * this table is a refusal this build cannot put into words, and is reported as
 * a plain failure rather than as an unnamed refusal.
 */
const INVITE_REFUSALS: Readonly<Record<string, UnieAiInviteRefusal>> = {
  invalid_email: 'invalid-email',
  self_invite: 'self-invite',
  already_invited: 'already-invited',
}

/**
 * The browser facilities the gateway uses, named so a test can drive them.
 * Production values come from the plugin body; nothing here is configurable,
 * because the three paths belong to the gate's own route table.
 */
export interface AccountGatewayEnvironment {
  /**
   * Issue one same-origin request to the host gate.
   * @param path - an absolute path on this origin.
   * @param init - request options.
   * @returns the response.
   */
  request: (path: string, init?: RequestInit) => Promise<Response>
  /**
   * Leave the app for one of the gate's own pages.
   * @param path - an absolute path on this origin.
   */
  navigate: (path: string) => void
  /** Reload the current document. */
  reload: () => void
}

/** Separator between an allowance row's fields; no field can contain it. */
const FIELD = '\u0000'
/** Separator between a state key's parts; no part can contain it. */
const ROW = '\u0001'

/**
 * Everything one state says, as one comparable string.
 *
 * The section compares states by identity, so a reading that repeats the
 * previous one must keep the previous object rather than allocate an equal
 * one. The key therefore covers every member this package writes — the avatar
 * included, because a save that changes only the photo still has to move the
 * state, and the activity series included, because a day's tokens changing is
 * the only thing that moves the heatmap.
 * @param state - the state to describe.
 * @returns a string equal for two states that say the same thing.
 */
function stateKey(state: UnieAiAccountState): string {
  if (state.status === 'failed') return `failed${ROW}${state.message}`
  if (state.status !== 'signed-in') return state.status
  const { identity, plan, usage, activity, invites } = state.account
  return [
    'signed-in', identity.displayName, identity.email, identity.avatarUrl ?? '', plan.label,
    ...usage.map(quota => [
      quota.id, quota.label, String(quota.used), String(quota.limit), quota.resetsAt ?? '',
      String(quota.windowHours ?? ''),
    ].join(FIELD)),
    ...(activity === undefined
      ? []
      : [
        Object.entries(activity.stats).map(pair => pair.join(FIELD)).join(FIELD),
        activity.daily.map(day => `${day.date}${FIELD}${String(day.tokens)}`).join(FIELD),
      ]),
    ...(invites === undefined
      ? []
      : [
        `${String(invites.credits ?? '')}${FIELD}${String(invites.sentCount ?? '')}`,
        (invites.sent ?? []).map(invite => [
          invite.inviteeEmail, invite.status ?? '', invite.sentAt ?? '', invite.url ?? '',
        ].join(FIELD)).join(FIELD),
      ]),
  ].join(ROW)
}

/** Reads the signed-in account from the host gate and publishes it. */
export class AccountGateway implements UnieAiAccountGateway {
  private readonly listeners = new Set<() => void>()
  private reading: AccountReading | undefined
  private state: UnieAiAccountState
  private locale: LocaleId
  private disposed = false
  private bootstrap: UnieAiBootstrap | undefined
  private offBootstrap: (() => void) | undefined
  private ownRead = false

  /**
   * @param environment - the browser facilities to use.
   * @param locale - the locale active at composition time.
   */
  constructor(private readonly environment: AccountGatewayEnvironment, locale: LocaleId) {
    this.locale = locale
    this.state = projectState(undefined, locale)
  }

  /**
   * Read the current state.
   * @returns the standing state; the same reference until the state moves.
   */
  getSnapshot(): UnieAiAccountState {
    return this.state
  }

  /**
   * Subscribe to state changes.
   * @param listener - called after every change.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Leave for the gate's device-code page; sign-in cannot happen in the app. */
  signIn(): void {
    this.environment.navigate(LOGIN_PATH)
  }

  /**
   * Drop the gate session and reload.
   *
   * The reload happens either way: the cookie is `HttpOnly`, so the app cannot
   * confirm what the session is now, and a document served after the request
   * shows whatever the gate actually decided.
   */
  signOut(): void {
    void this.environment.request(LOGOUT_PATH, { method: 'POST' })
      .catch(() => undefined)
      .then(() => { this.environment.reload() })
  }

  /**
   * Take this gateway's first account from the desktop's startup answer
   * instead of reading `/auth/account` itself.
   *
   * The startup answer was gathered on the host before the interface mounted,
   * so following it is what makes the Account section arrive populated rather
   * than filling in a moment later. Only the FIRST account comes from there:
   * every refresh this object performs afterwards — a profile save, an invite,
   * a retry — reads the route directly, because the startup answer describes
   * the start of the document and not the current state of the product.
   *
   * Following twice is a no-op, so a service event that fires more than once
   * cannot stack subscriptions.
   * @param bootstrap - the startup answer to follow.
   */
  followBootstrap(bootstrap: UnieAiBootstrap): void {
    if (this.bootstrap === bootstrap) return
    this.offBootstrap?.()
    this.bootstrap = bootstrap
    this.offBootstrap = bootstrap.subscribe(() => { this.adoptBootstrap() })
    this.adoptBootstrap()
  }

  /**
   * Take whatever the standing startup answer says about the account.
   *
   * Three of the five statuses are answers in themselves: `pending` is the
   * read that has not settled, `signed-out` is a desktop with no session —
   * which is a state, not a failure, and costs no request to establish — and
   * `unavailable` means there is no startup answer to be had, so this object
   * falls back to the one read it has always done. `ready` and `partial`
   * differ only in whether the account part is among the gathered ones.
   *
   * Once this object has read the route itself, the startup answer stops
   * being consulted: a gathered account is a description of the start of the
   * document, and republishing it over a live read would undo a save.
   */
  private adoptBootstrap(): void {
    const snapshot = this.bootstrap?.getSnapshot()
    if (snapshot === undefined || snapshot.status === 'pending' || this.ownRead) return
    if (snapshot.status === 'signed-out') {
      this.adopt({ status: 'signed-out' })
      return
    }
    const body = snapshot.parts.account
    if (body !== undefined) {
      this.adopt(readAccountResponse(body) ?? { status: 'unreachable' })
      return
    }
    // No account part: ask for it directly. The read below sets `ownRead`, so
    // a later startup follow-up carrying the part is ignored rather than
    // racing the answer this asked for.
    void this.refresh()
  }

  /**
   * Read `/auth/account` once and publish what it says.
   * @returns a promise settling when the reading has been published.
   */
  async refresh(): Promise<void> {
    this.ownRead = true
    this.adopt(await this.read())
  }

  /**
   * Store a profile change through the host, then republish the account.
   *
   * The re-read is the point of the write path: the product decides what it
   * actually stored — a trimmed name, a re-encoded photo — so the section is
   * shown the stored profile rather than the one it submitted. It happens only
   * after a `saved` verdict, because republishing after a refusal would
   * redraw the same account and read as a save that worked.
   * @param patch - the change to store.
   * @returns whether the host reported the change stored.
   */
  async saveProfile(patch: UnieAiProfilePatch): Promise<UnieAiProfileSaveResult> {
    const body: ProfileSaveBody = {
      name: patch.displayName,
      // The three avatar fields travel together or not at all: an absent
      // `image` is how the wire says "keep the stored photo", and sending its
      // MIME type without it would describe an upload that is not there.
      ...(patch.avatar === undefined
        ? {}
        : {
          image: patch.avatar.dataUrl,
          imageMimeType: patch.avatar.mimeType,
          imageExtension: patch.avatar.extension,
        }),
    }
    const response = await this.environment.request(PROFILE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined)
    if (response === undefined) return { status: 'failed' }
    // The body is read even when the status line is not 2xx: the host answers
    // a malformed patch with 400 and names the refusal in the body, and
    // dropping that body on the floor is exactly how a refused save used to
    // arrive at the form with nothing to say.
    const answer = readProfileResponse(await response.json().catch(() => undefined) as unknown)
    if (answer?.status === 'failed') {
      return answer.reason === undefined
        ? { status: 'failed' }
        : { status: 'failed', reason: answer.reason }
    }
    if (!response.ok || answer?.status !== 'saved') return { status: 'failed' }
    await this.refresh()
    return { status: 'saved' }
  }

  /**
   * Invite one address through the host, then republish the account.
   *
   * The re-read is what keeps the card honest: an invite that went out changes
   * the count the card shows, and the count is the product's, not this
   * object's. It happens only after a `sent` verdict — republishing after a
   * refusal would redraw the same account and read as an invite that worked.
   * @param email - the address to invite, as typed.
   * @returns what the attempt established.
   */
  async sendInvite(email: string): Promise<UnieAiInviteResult> {
    const body: InviteSendBody = { email }
    const response = await this.environment.request(INVITE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined)
    if (response === undefined) return { status: 'failed' }
    // A host with no invite route answers 404 (or 501 where it declares the
    // route unimplemented). That is a deployment that cannot send invites at
    // all, which the card says once rather than reporting as a send that
    // failed and might work on a retry.
    if (response.status === 404 || response.status === 501) return { status: 'unsupported' }
    const answer = readInviteResponse(await response.json().catch(() => undefined) as unknown)
    if (answer === undefined) return { status: 'failed' }
    if (answer.status === 'refused') {
      const reason = INVITE_REFUSALS[answer.reason]
      return reason === undefined ? { status: 'failed' } : { status: 'refused', reason }
    }
    if (answer.status !== 'sent') return { status: 'failed' }
    await this.refresh()
    return answer.url === undefined ? { status: 'sent' } : { status: 'sent', url: answer.url }
  }

  /**
   * Adopt a new active locale, relabelling the standing reading.
   * @param locale - the locale now active.
   */
  setLocale(locale: LocaleId): void {
    if (locale === this.locale) return
    this.locale = locale
    this.adopt(this.reading)
  }

  /** Stop publishing; a read still in flight lands on a closed gateway. */
  dispose(): void {
    this.disposed = true
    this.offBootstrap?.()
    this.offBootstrap = undefined
    this.bootstrap = undefined
    this.listeners.clear()
  }

  /**
   * Perform one read.
   * @returns what the attempt established.
   */
  private async read(): Promise<AccountReading> {
    const response = await this.environment.request(ACCOUNT_PATH).catch(() => undefined)
    if (response === undefined || !response.ok) return { status: 'unreachable' }
    const body = await response.json().catch(() => undefined) as unknown
    return readAccountResponse(body) ?? { status: 'unreachable' }
  }

  /**
   * Retain a reading and publish it, if it moved anything.
   * @param reading - the reading to stand on.
   */
  private adopt(reading: AccountReading | undefined): void {
    if (this.disposed) return
    this.reading = reading
    const next = projectState(reading, this.locale)
    if (stateKey(next) === stateKey(this.state)) return
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
