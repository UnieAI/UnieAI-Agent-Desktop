/**
 * The desktop account seam. Everything the Account settings section draws
 * about the person using UnieAI Agent arrives through these types, and no
 * other module in this package knows where the values came from.
 *
 * The supplier is a desktop BFF on the UnieAI web product, reached by a host
 * that holds the session's API key; a browser-side plugin provides one as the
 * `unieaiAccount` service. Until a plugin connects a
 * {@link UnieAiAccountGateway}, the state stays `unavailable` and the section
 * draws its not-connected card: this package invents no endpoint, no identity,
 * and no numbers.
 *
 * @module @unieai/uad-client-ui-unieai-account
 */

/** Who the account belongs to, as the desktop BFF reports it. */
export interface UnieAiAccountIdentity {
  /** Display name the user set on their UnieAI account. */
  displayName: string
  /**
   * Sign-in address. It appears once on the page, in the profile card, and is
   * never promoted into the heading's second line: the web product prints a
   * `@handle` there, this product has no handle column, and printing the
   * address in a handle's place put the same address on the page twice.
   */
  email: string
  /**
   * Avatar image, as anything an `<img src>` accepts — the UnieAI supplier
   * stores it as a `data:` URL. Absent accounts fall back to a monogram.
   */
  avatarUrl?: string
}

/**
 * A new avatar, as the file the user picked reduces to.
 *
 * All three fields travel because the supplier's own validation accepts an
 * extension in place of an unrecognised MIME type, and cross-checks the data
 * URL against the MIME type when one is given. Sending only the data URL would
 * make a legal upload look illegal.
 */
export interface UnieAiAvatarUpload {
  /** The image as a `data:<mime>;base64,...` URL. */
  dataUrl: string
  /** MIME type of the image (`image/png`), lowercased. */
  mimeType: string
  /** File extension including the dot (`.png`), lowercased. */
  extension: string
}

/**
 * One profile change the section submits.
 *
 * The avatar is absent unless the user actually replaced it: a name-only save
 * must leave the stored photo alone, and an absent field is the only way to
 * say that.
 */
export interface UnieAiProfilePatch {
  /** The display name to store; the supplier rejects one that is blank. */
  displayName: string
  /** A replacement avatar, or absent to keep the one already stored. */
  avatar?: UnieAiAvatarUpload
}

/**
 * Why the supplier refused one save, as a stable identifier rather than as
 * prose.
 *
 * The wording stays in this package — a failed save is one line of the
 * section's own form copy, which it already owns in every locale, and only the
 * browser knows the reader's language. What the supplier owns is WHICH refusal
 * happened, and that is an identifier the section can look up. A refusal this
 * build has no identifier for arrives as no reason at all, and the form falls
 * back to its general failure line.
 */
export type UnieAiProfileSaveReason =
  /** The display name was empty after trimming. */
  | 'name-required'
  /** The avatar's file type is not one the supplier stores. */
  | 'avatar-format'
  /** The avatar's data URL did not decode, or contradicted its MIME type. */
  | 'avatar-payload'

/** Every refusal identifier this build can put into words. */
export const PROFILE_SAVE_REASONS: readonly UnieAiProfileSaveReason[] = [
  'name-required', 'avatar-format', 'avatar-payload',
]

/** What one save established. */
export type UnieAiProfileSaveResult =
  /** The supplier stored the change; the account snapshot now reflects it. */
  | { status: 'saved' }
  /** The supplier refused the change, or could not be reached. */
  | { status: 'failed'; reason?: UnieAiProfileSaveReason }

/**
 * The plan the account is on. A label only — choosing, upgrading, and paying
 * for a plan stay on the web product, so nothing here carries a price, a
 * period, or a renewal.
 */
export interface UnieAiAccountPlan {
  /** Plan name already localized by the supplier (`Free`, `Pro`, `Max`). */
  label: string
}

/** One metered allowance in the account's current usage window. */
export interface UnieAiUsageQuota {
  /** Stable key for this allowance (`agent-turns`, `chat-tokens`, ...). */
  id: string
  /** Allowance name already localized by the supplier. */
  label: string
  /** Units consumed so far in the current window. */
  used: number
  /** Units included in the window; `null` when the allowance is unmetered. */
  limit: number | null
  /** When the window resets, as an already-formatted local string; absent when it does not. */
  resetsAt?: string
  /**
   * How long the window is, in hours. A raw number rather than a phrase: the
   * sentence it appears in (`Resets every 5 hours · Next ...`) is this
   * section's own copy, unlike the allowance name, which only the supplier can
   * write. Absent when the supplier reports no window length, and the reset
   * line then names only the instant.
   */
  windowHours?: number
}

/** One invite this account has sent. */
export interface UnieAiSentInvite {
  /** The address that was invited. */
  inviteeEmail: string
  /** Where the invite stands, already localized by the supplier. Absent when the supplier reports a state this build cannot name. */
  status?: string
  /** When it was sent, as an already-formatted local string; absent when unreported. */
  sentAt?: string
  /** Absolute URL that accepts THIS invite; absent when unreported. */
  url?: string
}

/**
 * The account's referral standing.
 *
 * The product's referral model is one row per invited address — each carries
 * its own single-use code — so there is no standing personal invite link to
 * publish and none is invented here. What the account has is the invites it
 * has sent and the rate-limit resets those invites have banked.
 *
 * Every member is optional because each comes from a different part of the
 * supplier's answer, and a part that did not arrive must read as unknown
 * rather than as an account that has invited nobody.
 */
export interface UnieAiInvites {
  /** Rate-limit resets banked and not yet spent; absent when unreported. */
  credits?: number
  /** How many invites this account has sent; absent when unreported. */
  sentCount?: number
  /** The invites themselves, newest first; absent when the supplier reports only a count. */
  sent?: readonly UnieAiSentInvite[]
}

/** Why the supplier refused one invite. */
export type UnieAiInviteRefusal =
  /** The address is not one the supplier will accept. */
  | 'invalid-email'
  /** The address is the signed-in account's own. */
  | 'self-invite'
  /** This account has already invited that address. */
  | 'already-invited'

/** What one invite attempt established. */
export type UnieAiInviteResult =
  /** The invite was created; `url` is the link that accepts it, when reported. */
  | { status: 'sent'; url?: string }
  /** The supplier refused it, for a reason the section puts into words. */
  | { status: 'refused'; reason: UnieAiInviteRefusal }
  /** This deployment cannot send invites from the desktop at all. */
  | { status: 'unsupported' }
  /** The attempt did not complete, and the supplier said nothing usable about why. */
  | { status: 'failed' }

/**
 * One figure in the Overview activity strip. The web product prints five:
 * total tokens, peak tokens, longest task, current streak, longest streak.
 */
export type UnieAiActivityStatId =
  | 'total-tokens'
  | 'peak-tokens'
  | 'longest-task'
  | 'current-streak'
  | 'longest-streak'

/** The strip's order, which is the web product's order. */
export const ACTIVITY_STAT_IDS: readonly UnieAiActivityStatId[] = [
  'total-tokens', 'peak-tokens', 'longest-task', 'current-streak', 'longest-streak',
]

/**
 * Activity figures by id, each already formatted by the supplier (`0`,
 * `0h 0m`, `0d`). The five differ in unit — a count, a duration, a day span —
 * and only the supplier knows which unit its number carries, so nothing here
 * turns a raw number into a reading. A key the supplier did not report is
 * absent, and the strip draws that cell as unknown rather than as zero.
 */
export type UnieAiActivityStats = Partial<Record<UnieAiActivityStatId, string>>

/** One day of the token-activity series. */
export interface UnieAiActivityDay {
  /** The day, as `YYYY-MM-DD`. */
  date: string
  /** Tokens that day. */
  tokens: number
}

/**
 * The Overview's activity: the five formatted figures, and the daily series
 * the Token Activity heatmap draws.
 *
 * The series is raw numbers rather than formatted text, because the heatmap
 * compares days against each other — it needs the quantities, not their
 * readings. A day with no usage is ABSENT from the series rather than present
 * at zero, exactly as the supplier reports it; the grid fills the gap itself,
 * because the shape of a year of weeks is the grid's own fact.
 */
export interface UnieAiActivity {
  /** The five strip figures; a figure the supplier did not report is absent. */
  stats: UnieAiActivityStats
  /** Days that recorded usage, ascending. */
  daily: readonly UnieAiActivityDay[]
}

/** Everything the section renders once a session exists. */
export interface UnieAiAccount {
  /** Name, email, and optional avatar. */
  identity: UnieAiAccountIdentity
  /** Current plan label. */
  plan: UnieAiAccountPlan
  /** Metered allowances, in the order the section lists them. */
  usage: readonly UnieAiUsageQuota[]
  /** Activity figures and series for the Overview; absent where none are reported. */
  activity?: UnieAiActivity
  /** Referral standing; absent where the deployment runs no referral program. */
  invites?: UnieAiInvites
}

/**
 * The section's whole world, as one discriminated union.
 *
 * `unavailable` and `signed-out` differ by whether a Sign in button would do
 * anything, so they must not collapse into one. There is deliberately no
 * pending state between `signed-out` and `signed-in`: the sign-in this product
 * runs is a device-code flow the host renders server-side, so the browser
 * LEAVES the single-page app to perform it and the state that would describe
 * waiting can never be observed from inside the app.
 */
export type UnieAiAccountState =
  /** No gateway is composed in this build; sign-in cannot start. */
  | { status: 'unavailable' }
  /** A gateway is composed and holds no session. */
  | { status: 'signed-out' }
  /** A session exists and the account snapshot loaded. */
  | { status: 'signed-in'; account: UnieAiAccount }
  /** The last attempt failed; the message is supplier-owned, already localized. */
  | { status: 'failed'; message: string }

/**
 * What a desktop BFF plugin implements and hands to this section.
 * The gateway owns the token, the sign-in flow, and every request; this
 * package only reads snapshots and forwards user gestures.
 */
export interface UnieAiAccountGateway {
  /**
   * Current state. Must return the same reference until the state actually
   * moves (the render machinery compares by identity).
   * @returns the current account state.
   */
  getSnapshot: () => UnieAiAccountState
  /**
   * Subscribe to state changes.
   * @param listener - called after every state change.
   * @returns unsubscribe.
   */
  subscribe: (listener: () => void) => () => void
  /** Begin (or retry) the sign-in. */
  signIn: () => void
  /** Drop the local session and its token. */
  signOut: () => void
  /**
   * Store a profile change and republish the account.
   *
   * The gateway owns the write the same way it owns the reads: the section
   * hands over a patch and learns only whether it was stored, and why not. A
   * `saved` result means the snapshot returned by {@link getSnapshot} already
   * carries the new values, so the section never has to merge its own edit
   * into the account it is rendering.
   * @param patch - the change to store.
   * @returns what the attempt established.
   */
  saveProfile: (patch: UnieAiProfilePatch) => Promise<UnieAiProfileSaveResult>
  /**
   * Invite one address, and republish the account.
   *
   * Optional because it is a write, and a supplier may expose only reads. A
   * gateway that omits it leaves the section with no compose field at all,
   * rather than a Send button that cannot send.
   * @param email - the address to invite, as typed.
   * @returns what the attempt established.
   */
  sendInvite?: (email: string) => Promise<UnieAiInviteResult>
}

/** The cordis service name a gateway plugin provides to reach this section. */
export const ACCOUNT_GATEWAY_SERVICE = 'unieaiAccount'

/**
 * Percentage of an allowance still unspent.
 * @param quota - the allowance.
 * @returns 0-100 rounded, or `null` when the allowance is unmetered.
 */
export function remainingPercent(quota: UnieAiUsageQuota): number | null {
  if (quota.limit === null || quota.limit <= 0) return null
  const left = 1 - quota.used / quota.limit
  return Math.round(Math.min(1, Math.max(0, left)) * 100)
}

/**
 * Group a count into thousands without depending on the host's Intl data,
 * which differs between a browser and the node test runs.
 * @param value - a non-negative count.
 * @returns the grouped digits (`1234567` renders as `1,234,567`).
 */
export function groupDigits(value: number): string {
  const whole = Math.max(0, Math.round(value)).toString()
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
