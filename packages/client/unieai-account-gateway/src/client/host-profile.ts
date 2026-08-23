/**
 * The `/auth/profile` wire format, restated on the browser side of that
 * process boundary, plus the reader that narrows one JSON body onto it.
 *
 * Same rule as {@link ./host-account.ts}: the host owns these names in
 * `@deepseek-ai/dsh-unieai-web-gate` and they are declared again here rather
 * than imported, because a page may be served by a host one deploy ahead of or
 * behind it.
 *
 * The host's `message` is still not read: it is an English diagnostic for a
 * direct caller, and only the browser knows the reader's language. What IS
 * read is `reason`, the host's stable identifier for WHICH refusal happened —
 * the same split the gate already uses for a refused provider. The section
 * owns the wording; the supplier owns the fact. A `reason` this build has no
 * line for is discarded, and the form falls back to its general failure line
 * rather than printing an identifier at a reader.
 */

/** What the browser sends to store a change. */
export interface ProfileSaveBody {
  /** The display name to store. */
  name: string
  /** A new avatar as a data URL, or absent to keep the stored one. */
  image?: string
  /** MIME type of `image`; the product cross-checks it against the data URL. */
  imageMimeType?: string
  /** File extension of `image`, accepted in place of a known MIME type. */
  imageExtension?: string
}

/**
 * The refusal identifiers the host is expected to send, in the order the
 * product's own validation applies them. They are spelled here as the section
 * spells them, because the section is what turns one into a line of copy.
 */
export const PROFILE_REASONS = ['name-required', 'avatar-format', 'avatar-payload'] as const

/** One refusal identifier this build can put into words. */
export type ProfileReason = typeof PROFILE_REASONS[number]

/** What `/auth/profile` answers. */
export type HostProfileResponse =
  /** The browser holds no gate session. */
  | { status: 'signed-out' }
  /** The change was stored. */
  | { status: 'saved' }
  /**
   * The product refused the change, or would not report the profile. `reason`
   * is present when the host named which refusal it was, and absent both when
   * it named none and when it named one this build cannot render.
   */
  | { status: 'failed'; reason?: ProfileReason }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Read one `/auth/profile` body.
 *
 * A `signed-in` answer — what the route's GET half returns — is not a save
 * verdict, so it is not one of the outcomes: this reader serves the save, and
 * the account snapshot is what the section re-reads afterwards.
 * @param body - the parsed JSON body.
 * @returns the answer, or undefined when the body is not one this build knows
 * how to read, which the caller reports as a failure rather than a save.
 */
export function readProfileResponse(body: unknown): HostProfileResponse | undefined {
  if (!isRecord(body)) return undefined
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  if (body['status'] === 'saved') return { status: 'saved' }
  if (body['status'] === 'failed') {
    const reason = body['reason']
    return typeof reason === 'string' && (PROFILE_REASONS as readonly string[]).includes(reason)
      ? { status: 'failed', reason: reason as ProfileReason }
      : { status: 'failed' }
  }
  return undefined
}
