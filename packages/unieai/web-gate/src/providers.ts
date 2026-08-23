/**
 * Reads and adds the signed-in account's API Providers through the web
 * product's desktop BFF.
 *
 * Same seam as {@link ./account.ts}, for the same reason: the API key that
 * authenticates `/api/desktop/*` lives in the gate's session table and must
 * not reach a page. The browser asks the host, the host asks the product, and
 * only the product's answer — which carries no credential — travels back.
 *
 * The write direction is what makes this module different from the account
 * one. It carries a provider's API key from the browser to the product, and
 * nothing in the other direction ever carries one back: {@link ProviderSummary}
 * has no field for a credential, so a provider's secret can only ever move
 * from the person who typed it to the store that will spend it. The desktop
 * keeps no copy, which is also why {@link ProviderPatch} treats an absent
 * `apiKey` as "keep the stored one" rather than as an empty string.
 *
 * Nothing here interprets a refusal, and nothing here decides what a
 * platform-managed row may change. The product owns both — a taken prefix, a
 * plan limit, a malformed endpoint, a Studio-managed row whose credential and
 * catalogue are the binding's — and answers with a stable identifier; this
 * module forwards that identifier, and the offending field names beside it, so
 * the browser half can render the reader's own language for it. A second copy
 * of those rules on this host is how the desktop would come to offer an edit
 * the product then refuses.
 */

/** One provider as the product reports it to a desktop. Carries no credential. */
export interface ProviderSummary {
  /** The product's own row id; the identity this provider has on both sides. */
  id: string
  /** User-chosen label; empty when they never set one. */
  displayName: string
  /** The globally unique 4-character routing prefix. */
  prefix: string
  /** OpenAI-compatible endpoint. */
  apiUrl: string
  /** Whether the provider serves requests at all. */
  enabled: boolean
  /**
   * Whether the platform owns this row (a linked UnieAI Studio catalogue).
   * The product then accepts only the per-model selection and the
   * whole-provider enable flag on it, and refuses to delete it at all.
   */
  managed: boolean
  /** Model ids the provider's catalogue reports. */
  models: string[]
  /** The subset enabled for chat. */
  selectedModels: string[]
  /** ISO timestamp of the last change. */
  updatedAt: string
}

/** The fields a desktop may submit when adding a provider. */
export interface ProviderDraft {
  displayName: string
  prefix: string
  apiUrl: string
  /** The credential the product will store and spend; never read back. */
  apiKey: string
}

/** What one create attempt established. */
export type ProviderCreateOutcome =
  /** The product created the row and reported it back. */
  | { status: 'created'; provider: ProviderSummary }
  /**
   * The product refused, naming a reason. `reason` is the product's stable
   * identifier (`prefix_taken`, `byo_provider_limit_reached`, ...), not a
   * sentence: only the browser knows the reader's language.
   */
  | { status: 'refused'; reason: string }
  /** The request never reached a verdict. */
  | { status: 'failed' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/** Narrow a reported list of model ids, dropping anything that is not one. */
function readModels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/**
 * Narrow one reported provider.
 *
 * A row with no id cannot be addressed or de-duplicated, so it is dropped
 * rather than rendered as a provider with no identity. Everything else has a
 * defined absence: no name, no models, not enabled.
 * @param value - a candidate provider object.
 * @returns the provider, or undefined when the value is not one.
 */
export function readProvider(value: unknown): ProviderSummary | undefined {
  if (!isRecord(value)) return undefined
  const id = readString(value['id'])
  if (id === '') return undefined
  return {
    id,
    displayName: readString(value['displayName']),
    prefix: readString(value['prefix']),
    apiUrl: readString(value['apiUrl']),
    enabled: value['enabled'] === true,
    // Unknown means managed: a build of the product that predates the flag
    // must be treated as the more restricted case, so the desktop offers the
    // narrow gestures rather than an edit form the product would then refuse.
    managed: value['managed'] !== false,
    models: readModels(value['models']),
    selectedModels: readModels(value['selectedModels']),
    updatedAt: readString(value['updatedAt']),
  }
}

/**
 * Read the account's providers.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the providers, or undefined when the list could not be read — which
 * the caller reports as a failure rather than as an account with none.
 */
export async function fetchProviders(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProviderSummary[] | undefined> {
  const response = await fetch(`${baseUrl}/api/desktop/providers`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body) || !Array.isArray(body['providers'])) return undefined
  const providers: ProviderSummary[] = []
  for (const entry of body['providers']) {
    const provider = readProvider(entry)
    if (provider !== undefined) providers.push(provider)
  }
  return providers
}

/**
 * The draft carried by one create request, or undefined when the body is not
 * one. Shape only — the product owns the rules, and duplicating them here
 * would let the two disagree about what a valid prefix is.
 * @param body - the parsed request body.
 * @returns the draft, or undefined when a required field is missing.
 */
export function readProviderDraft(body: unknown): ProviderDraft | undefined {
  if (!isRecord(body)) return undefined
  const prefix = readString(body['prefix']).trim()
  const apiUrl = readString(body['apiUrl']).trim()
  const apiKey = readString(body['apiKey']).trim()
  if (prefix === '' || apiUrl === '' || apiKey === '') return undefined
  return { displayName: readString(body['displayName']).trim(), prefix, apiUrl, apiKey }
}

/**
 * Add one provider to the account.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param draft - the provider the browser submitted, credential included.
 * @param signal - cancels the request.
 * @returns what the attempt established.
 */
export async function createProvider(
  baseUrl: string,
  apiKey: string,
  draft: ProviderDraft,
  signal?: AbortSignal,
): Promise<ProviderCreateOutcome> {
  const response = await fetch(`${baseUrl}/api/desktop/providers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(draft),
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { status: 'failed' }
  const body = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const reason = isRecord(body) ? readString(body['error']) : ''
    // A refusal with no identifier is still a refusal, not a transport
    // failure: retrying it would fail the same way.
    return { status: 'refused', reason: reason === '' ? 'create_refused' : reason }
  }
  const provider = isRecord(body) ? readProvider(body['provider']) : undefined
  // The product answered 2xx with something this build cannot read. The row
  // may well exist, so this is not a refusal to retry blindly.
  if (provider === undefined) return { status: 'failed' }
  return { status: 'created', provider }
}

/**
 * The fields a desktop may submit when editing a provider.
 *
 * Every member is optional and absence means "leave alone", including
 * `apiKey`: nothing here can read a stored credential back, so a save that
 * does not carry one must keep the one the product already holds rather than
 * blank it.
 */
export interface ProviderPatch {
  displayName?: string
  prefix?: string
  apiUrl?: string
  /** A newly typed credential, replacing the stored one; absent keeps it. */
  apiKey?: string
  enabled?: boolean
  /** The model ids to serve for chat, replacing the stored selection. */
  selectedModels?: string[]
}

/** What one edit attempt established. */
export type ProviderUpdateOutcome =
  /** The product wrote the row and reported it back. */
  | { status: 'updated'; provider: ProviderSummary }
  /**
   * The product refused, naming a reason. `reason` is its stable identifier
   * (`managed_provider_readonly`, `prefix_taken`, `not_found`, ...) and
   * `fields` the offending field names a managed-row refusal carries.
   */
  | { status: 'refused'; reason: string; fields: string[] }
  /** The request never reached a verdict. */
  | { status: 'failed' }

/** What one delete attempt established. */
export type ProviderDeleteOutcome =
  /** The row, and every model it offered, is gone. */
  | { status: 'deleted' }
  /** The product refused, naming a reason — a managed row is the usual one. */
  | { status: 'refused'; reason: string; fields: string[] }
  /** The request never reached a verdict. */
  | { status: 'failed' }

/** The offending field names a refusal carries, or none. */
function readFields(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body['fields'])) return []
  return body['fields'].filter((entry): entry is string => typeof entry === 'string')
}

/**
 * The patch carried by one edit request, or undefined when the body names
 * nothing to change.
 *
 * Shape only, as {@link readProviderDraft} is: which prefixes are free, what a
 * managed row may change, and what an acceptable endpoint is are the product's
 * rules, and a second copy here is how the two would come to disagree. The one
 * thing this reader must get right is absence — a field this body does not
 * carry must not reach the product as an empty string, because that is the
 * difference between keeping a credential and erasing it.
 * @param body - the parsed request body.
 * @returns the patch, or undefined when it would change nothing.
 */
export function readProviderPatch(body: unknown): ProviderPatch | undefined {
  if (!isRecord(body)) return undefined
  const patch: ProviderPatch = {}
  for (const field of ['displayName', 'prefix', 'apiUrl', 'apiKey'] as const) {
    if (typeof body[field] === 'string') patch[field] = body[field]
  }
  if (typeof body['enabled'] === 'boolean') patch.enabled = body['enabled']
  if (Array.isArray(body['selectedModels'])) {
    patch.selectedModels = body['selectedModels']
      .filter((entry): entry is string => typeof entry === 'string')
  }
  return Object.keys(patch).length === 0 ? undefined : patch
}

/**
 * Apply one edit to a provider on the account.
 *
 * `enabled` is renamed to the product's own `enable` on the way out: the read
 * projection reports `enabled`, and asking a page to submit a different spelling
 * than it was shown would be a trap.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param id - the product's own row id for the provider.
 * @param patch - the fields to change; absent members are left alone.
 * @param signal - cancels the request.
 * @returns what the attempt established.
 */
export async function updateProvider(
  baseUrl: string,
  apiKey: string,
  id: string,
  patch: ProviderPatch,
  signal?: AbortSignal,
): Promise<ProviderUpdateOutcome> {
  const { enabled, ...rest } = patch
  const response = await fetch(`${baseUrl}/api/desktop/providers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(enabled === undefined ? rest : { ...rest, enable: enabled }),
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { status: 'failed' }
  const body = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const reason = isRecord(body) ? readString(body['error']) : ''
    // A refusal with no identifier is still a refusal, not a transport
    // failure: retrying it would fail the same way.
    return {
      status: 'refused',
      reason: reason === '' ? 'update_refused' : reason,
      fields: readFields(body),
    }
  }
  const provider = isRecord(body) ? readProvider(body['provider']) : undefined
  // The product answered 2xx with something this build cannot read. The write
  // may well have landed, so this is not a refusal to retry blindly.
  if (provider === undefined) return { status: 'failed' }
  return { status: 'updated', provider }
}

/**
 * Remove one provider from the account, and with it every model it offered.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param id - the product's own row id for the provider.
 * @param signal - cancels the request.
 * @returns what the attempt established.
 */
export async function deleteProvider(
  baseUrl: string,
  apiKey: string,
  id: string,
  signal?: AbortSignal,
): Promise<ProviderDeleteOutcome> {
  const response = await fetch(`${baseUrl}/api/desktop/providers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { status: 'failed' }
  if (response.ok) return { status: 'deleted' }
  // The success answer is 204 with no body, so a body is read only to name a
  // refusal.
  const body = await response.json().catch(() => undefined) as unknown
  const reason = isRecord(body) ? readString(body['error']) : ''
  return {
    status: 'refused',
    reason: reason === '' ? 'delete_refused' : reason,
    fields: readFields(body),
  }
}
