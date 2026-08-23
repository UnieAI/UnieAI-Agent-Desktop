/**
 * Reads and writes the signed-in account's profile — display name and avatar —
 * through the web product's desktop BFF.
 *
 * This runs on the host for the same reason {@link ./account.ts} does: the API
 * key that authenticates `/api/desktop/*` lives in the gate's session table and
 * must not reach a page. The browser asks the host, the host asks the product,
 * and only the product's answer — which carries no credential — is written
 * back.
 *
 * Nothing here validates the patch. The product owns what a legal display name
 * and a legal avatar are (`app/api/desktop/profile`, whose rules are the
 * browser route's rules verbatim), and a second, drifting copy of those rules
 * on this side would only decide differently. A rejected patch is reported as
 * a failure, not repaired.
 *
 * A refusal is reported as an IDENTIFIER, not as prose. The product answers a
 * rejected `PATCH` with an English sentence written for a direct caller, and
 * only the browser knows the reader's language — so this module recognises
 * which of the product's three refusals happened and forwards that fact, the
 * same discipline {@link ./providers.ts} already uses for a refused create.
 */

/** The profile as both the desktop and the web product show it. */
export interface AccountProfile {
  /** Display name, or null for an account that set none. */
  name: string | null
  /** Sign-in address. */
  email: string
  /** Avatar as a data URL, or null for an account with none. */
  image: string | null
}

/**
 * One profile change, in the wire shape the product's route accepts.
 *
 * `image` carries three distinct intents and all three are used: a data URL
 * sets the avatar, `null` clears it, and an absent field leaves it untouched
 * so a name-only save cannot delete a photo.
 */
export interface ProfilePatch {
  /** New display name; the product rejects one that is empty after trimming. */
  name: string
  /** New avatar as a data URL, null to clear it, or absent to leave it. */
  image?: string | null
  /** MIME type of `image`, which the product checks against the data URL. */
  imageMimeType?: string | null
  /** File extension of `image`, accepted in place of a known MIME type. */
  imageExtension?: string | null
}

/**
 * Which refusal a rejected profile save was. The three are the product's own
 * three checks, in the order it applies them
 * (`lib/desktop/profile.ts:writeDesktopProfile`).
 */
export type ProfileRefusal = 'name-required' | 'avatar-format' | 'avatar-payload'

/** What one profile save established. */
export type ProfileWriteOutcome =
  /** The product stored the change and reported the profile that resulted. */
  | { status: 'saved'; profile: AccountProfile }
  /** The product refused it, naming which of its three checks failed. */
  | { status: 'refused'; reason: ProfileRefusal }
  /** The request never reached a verdict this module could read. */
  | { status: 'failed' }

/**
 * The product's rejection sentences, mapped onto the identifiers a browser can
 * put into its reader's own language.
 *
 * Matching on prose is not ideal and is done anyway: the route answers
 * `new Response(message, { status })` with no code of its own, and the
 * alternative — reporting every 400 as an unexplained failure — is what the
 * Account section currently shows and what this exists to fix. An unrecognised
 * sentence stays a plain failure rather than being guessed at.
 */
const REFUSALS: ReadonlyArray<readonly [string, ProfileRefusal]> = [
  ['name is required', 'name-required'],
  ['unsupported avatar format', 'avatar-format'],
  ['invalid image payload', 'avatar-payload'],
]

/**
 * Recognise one rejection sentence.
 * @param body - the product's response body, as text.
 * @returns the identifier, or undefined for a sentence this build cannot place.
 */
export function readProfileRefusal(body: string): ProfileRefusal | undefined {
  const text = body.toLowerCase()
  for (const [sentence, reason] of REFUSALS) {
    if (text.includes(sentence)) return reason
  }
  return undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Narrow one profile body.
 * @param body - the parsed JSON the product answered with.
 * @returns the profile, or undefined when the body is not one.
 */
function readProfile(body: unknown): AccountProfile | undefined {
  if (!isRecord(body)) return undefined
  const email = body['email']
  if (typeof email !== 'string') return undefined
  return {
    name: typeof body['name'] === 'string' ? body['name'] : null,
    email,
    image: typeof body['image'] === 'string' ? body['image'] : null,
  }
}

/**
 * Read the account's profile.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the profile, or undefined when the product would not report one.
 */
export async function fetchAccountProfile(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AccountProfile | undefined> {
  const response = await fetch(`${baseUrl}/api/desktop/profile`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return readProfile(await response.json().catch(() => undefined) as unknown)
}

/**
 * Apply one profile change, then report the profile that resulted.
 *
 * The read-back is deliberate rather than an echo of the request: the product
 * decides what it actually stored — a trimmed name, a cleared avatar — and the
 * desktop must show that, not what it asked for.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param patch - the change to apply.
 * @param signal - cancels the requests.
 * @returns what the attempt established: the stored profile, the refusal the
 * product named, or a failure that reached no verdict.
 */
export async function updateAccountProfile(
  baseUrl: string,
  apiKey: string,
  patch: ProfilePatch,
  signal?: AbortSignal,
): Promise<ProfileWriteOutcome> {
  const response = await fetch(`${baseUrl}/api/desktop/profile`, {
    method: 'PATCH',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(patch),
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { status: 'failed' }
  if (!response.ok) {
    const reason = readProfileRefusal(await response.text().catch(() => ''))
    // A refusal this build cannot place is still a refusal, but naming one at
    // random would put the wrong sentence in front of the person: an
    // unrecognised rejection reaches the page as an unexplained failure, which
    // is what it is.
    return reason === undefined ? { status: 'failed' } : { status: 'refused', reason }
  }
  const profile = await fetchAccountProfile(baseUrl, apiKey, signal)
  // The write landed; the read-back did not. Reporting a refusal here would
  // tell the person their change was rejected when it was stored.
  return profile === undefined ? { status: 'failed' } : { status: 'saved', profile }
}
