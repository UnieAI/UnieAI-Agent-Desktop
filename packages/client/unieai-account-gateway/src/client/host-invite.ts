/**
 * The `/auth/invite` wire format, restated on the browser side of that process
 * boundary, plus the reader that narrows one JSON body onto it.
 *
 * Same rule as {@link ./host-account.ts}: the host owns these names and they
 * are declared again here rather than imported, because a page may be served
 * by a host one deploy ahead of or behind it.
 *
 * A refusal travels as the product's own identifier rather than as prose —
 * the same discipline the gate already uses for a refused provider. Only the
 * browser knows the reader's language, so the host says WHICH refusal happened
 * and the section says it in words. An identifier this build does not
 * recognise still arrives here, and is reported as a refusal with no reason
 * rather than dropped.
 */

/** What the browser sends to invite one address. */
export interface InviteSendBody {
  /** The address to invite, as the user typed it. */
  email: string
}

/** What `/auth/invite` answers. */
export type HostInviteResponse =
  /** The browser holds no gate session. */
  | { status: 'signed-out' }
  /** The invite was created; `url` is the link that accepts it, when reported. */
  | { status: 'sent'; url?: string }
  /** The product refused it, naming which refusal. */
  | { status: 'refused'; reason: string }
  /** The product did not answer, or answered something the host could not use. */
  | { status: 'failed' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Read one `/auth/invite` body.
 * @param body - the parsed JSON body.
 * @returns the answer, or undefined when the body is not one this build knows
 * how to read, which the caller reports as a failure rather than as an invite
 * that went out.
 */
export function readInviteResponse(body: unknown): HostInviteResponse | undefined {
  if (!isRecord(body)) return undefined
  const status = body['status']
  if (status === 'signed-out') return { status: 'signed-out' }
  if (status === 'failed') return { status: 'failed' }
  if (status === 'refused') {
    const reason = body['reason']
    return { status: 'refused', reason: typeof reason === 'string' ? reason : '' }
  }
  if (status !== 'sent') return undefined
  const url = body['url']
  return { status: 'sent', ...(typeof url === 'string' && url !== '' ? { url } : {}) }
}
