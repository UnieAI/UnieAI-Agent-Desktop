/**
 * Sends one referral invite through the web product's desktop BFF, and reads
 * the invites an account has already sent.
 *
 * Same seam as {@link ./providers.ts}, and the same two rules. The API key
 * that authenticates `/api/desktop/*` lives in the gate's session table and
 * must not reach a page. And a refusal travels as the product's own stable
 * identifier (`invalid_email`, `self_invite`, `already_invited`) rather than
 * as prose, because only the browser knows the reader's language.
 *
 * `inviteUrl` is forwarded, and that is a deliberate judgement rather than an
 * oversight: it is a redemption link the person is meant to send to someone
 * else, so it is the product of the operation, not a credential the desktop is
 * holding on the account's behalf. Every row is still built field by field —
 * a column the product adds later has nowhere to land here unless someone adds
 * it to {@link SentInvite} as well.
 */

/** One invite the account has sent, as the product reports it. */
export interface SentInvite {
  /** The address that was invited. */
  inviteeEmail: string
  /** The product's own state name (`pending`, `joined`, `rewarded`). */
  status: string
  /** ISO timestamp the invite was created at; empty when unreported. */
  createdAt: string
  /** Absolute URL that accepts this one invite; empty when unreported. */
  inviteUrl: string
}

/** What one send attempt established. */
export type InviteSendOutcome =
  /** The product created the invite; `url` is the link that accepts it. */
  | { status: 'sent'; url?: string }
  /**
   * The product refused, naming a reason. `reason` is its stable identifier
   * (`invalid_email`, `self_invite`, `already_invited`), not a sentence.
   */
  | { status: 'refused'; reason: string }
  /** The request never reached a verdict. */
  | { status: 'failed' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/**
 * Narrow one reported invite.
 *
 * A row with no address names nobody, so it is dropped rather than rendered as
 * an invite to no one. Everything else has a defined absence: no state, no
 * timestamp, no link.
 * @param value - a candidate invite row.
 * @returns the invite, or undefined when the value is not one.
 */
export function readSentInvite(value: unknown): SentInvite | undefined {
  if (!isRecord(value)) return undefined
  const inviteeEmail = readString(value['inviteeEmail'])
  if (inviteeEmail === '') return undefined
  return {
    inviteeEmail,
    status: readString(value['status']),
    createdAt: readString(value['createdAt']),
    inviteUrl: readString(value['inviteUrl']),
  }
}

/**
 * Narrow a reported list of invites.
 * @param value - the `referrals` member of the product's answer.
 * @returns the rows, or undefined when the value is not a list — which the
 * caller reports as "not forwarded" rather than as an account that has
 * invited nobody.
 */
export function readSentInvites(value: unknown): SentInvite[] | undefined {
  if (!Array.isArray(value)) return undefined
  const invites: SentInvite[] = []
  for (const row of value) {
    const invite = readSentInvite(row)
    if (invite !== undefined) invites.push(invite)
  }
  return invites
}

/**
 * The address one send request carries, or undefined when the body names
 * none. Shape only: which addresses are legal, and which are this account's
 * own, are the product's rules, and a second copy here could only disagree.
 * @param body - the parsed request body.
 * @returns the trimmed address, or undefined when there is none.
 */
export function readInviteEmail(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined
  const email = readString(body['email']).trim()
  return email === '' ? undefined : email
}

/**
 * Invite one address on the account's behalf.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param email - the address to invite, as the person typed it.
 * @param signal - cancels the request.
 * @returns what the attempt established.
 */
export async function sendInvite(
  baseUrl: string,
  apiKey: string,
  email: string,
  signal?: AbortSignal,
): Promise<InviteSendOutcome> {
  const response = await fetch(`${baseUrl}/api/desktop/invite`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { status: 'failed' }
  const body = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const reason = isRecord(body) ? readString(body['error']) : ''
    // A refusal with no identifier is still a refusal, not a transport
    // failure: retrying it would fail the same way.
    return { status: 'refused', reason: reason === '' ? 'invite_refused' : reason }
  }
  if (!isRecord(body) || body['ok'] !== true) return { status: 'failed' }
  const url = readString(body['inviteUrl'])
  return { status: 'sent', ...(url === '' ? {} : { url }) }
}
