/**
 * The provider list this section renders, read and written through the
 * sign-in gate's `/auth/providers` routes.
 *
 * There is exactly ONE store of API Providers, and it is the web product's.
 * This object holds no copy of it: it mirrors what the host last reported and
 * re-reads after every write, so a row shown here and a row shown on the web
 * product's settings page are the same row rather than two that have to be
 * reconciled. Nothing in the desktop's own `settings.yaml` is written from
 * here, and nothing here is written from `settings.yaml`.
 *
 * Credentials move in one direction only. A create, and an edit that carries a
 * newly typed key, send it towards the product, which is the store that will
 * spend it; no answer from the host ever carries a provider credential back,
 * because {@link ProviderRow} has no field for one. That is also why an edit
 * that leaves the key field blank omits `apiKey` entirely rather than sending
 * an empty string: this page cannot show the stored credential, so it must not
 * be able to erase it by saving a rename.
 *
 * What a Studio-managed row may change is not decided here. The product owns
 * that rule and answers `managed_provider_readonly` with the offending field
 * names; this object forwards the identifier and the section renders only the
 * gestures the flag says will be accepted, so the refusal is a backstop rather
 * than the normal path.
 *
 * The object caches its state so repeated reads keep one reference between
 * changes — the uSES contract the render machinery relies on.
 */

/** One provider as this section shows it. Carries no credential, by type. */
export interface ProviderRow {
  /** The web product's own row id; the identity this provider has on both sides. */
  id: string
  /** The label the user gave it; empty when they gave none. */
  displayName: string
  /** The globally unique 4-character routing prefix. */
  prefix: string
  /** The OpenAI-compatible endpoint; empty when the product reported none. */
  apiUrl: string
  /** Whether the provider serves requests at all. */
  enabled: boolean
  /**
   * Whether the platform owns this row (a linked UnieAI Studio catalogue).
   * Such a row accepts only its per-model selection and its enable flag, and
   * cannot be deleted from here at all.
   */
  managed: boolean
  /** Model ids its catalogue reports. */
  models: readonly string[]
  /** The subset enabled for chat. */
  selectedModels: readonly string[]
}

/** What the section knows about the account's providers right now. */
export type ProvidersState =
  /** The first read has not settled yet. */
  | { status: 'loading' }
  /** The host holds no session, so there is no account to list providers for. */
  | { status: 'signed-out' }
  /** A session exists and the list could not be read. */
  | { status: 'failed' }
  /** The list as the product last reported it; empty is a real answer. */
  | { status: 'ready'; providers: readonly ProviderRow[] }

/** What one write attempt established, in the caller's own vocabulary. */
export type ProviderOutcome =
  | { ok: true }
  /** `reason` is a dictionary key, already chosen from the product's identifier. */
  | { ok: false; reason: ProviderFailure }

/** The refusal lines this section can show. */
export type ProviderFailure =
  | 'error.name'
  | 'error.prefixExists'
  | 'error.prefixFormat'
  | 'error.prefixRequired'
  | 'error.fields'
  | 'error.url'
  | 'error.limit'
  | 'error.managed'
  | 'error.notFound'
  | 'error.deleteFailed'
  | 'error.failed'

/** Route the browser reads and writes providers through. */
const PROVIDERS_PATH = '/auth/providers'

/**
 * The browser facilities this source uses, named so a test can drive them.
 * Production values come from the plugin body; the path is not configurable,
 * because it belongs to the gate's own route table.
 */
export interface ProviderEnvironment {
  /**
   * Issue one same-origin request to the host gate.
   * @param path - an absolute path on this origin.
   * @param init - request options.
   * @returns the response.
   */
  request: (path: string, init?: RequestInit) => Promise<Response>
}

/** The fields a create submits. The key travels; it is never read back. */
export interface ProviderDraft {
  displayName: string
  prefix: string
  apiUrl: string
  apiKey: string
}

/**
 * The fields an edit submits. Every member is optional and absence means
 * "leave alone" — `apiKey` above all, because a blank key field means the user
 * did not retype the credential, not that they want it cleared.
 */
export interface ProviderPatch {
  displayName?: string
  prefix?: string
  apiUrl?: string
  apiKey?: string
  enabled?: boolean
  selectedModels?: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

const readStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/**
 * Narrow one reported provider.
 *
 * A row with no id is dropped: it cannot be keyed in a list, and rendering it
 * would put a provider on the page that no later answer could match.
 * @param value - a candidate provider object.
 * @returns the row, or undefined when the value is not one.
 */
export function readProviderRow(value: unknown): ProviderRow | undefined {
  if (!isRecord(value)) return undefined
  const id = readString(value['id'])
  if (id === '') return undefined
  return {
    id,
    displayName: readString(value['displayName']),
    prefix: readString(value['prefix']),
    apiUrl: readString(value['apiUrl']),
    enabled: value['enabled'] === true,
    // Unknown means managed. A host that predates the flag must be treated as
    // the more restricted case, so this page offers the narrow gestures rather
    // than an edit form the product would then refuse.
    managed: value['managed'] !== false,
    models: readStrings(value['models']),
    selectedModels: readStrings(value['selectedModels']),
  }
}

/**
 * Read one `/auth/providers` body into a state.
 * @param body - the parsed JSON body.
 * @returns the state it describes, or undefined when this build cannot read it
 * — which the caller reports as a failure rather than as an account with no
 * providers.
 */
export function readProvidersResponse(body: unknown): ProvidersState | undefined {
  if (!isRecord(body)) return undefined
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  if (body['status'] === 'failed') return { status: 'failed' }
  if (body['status'] !== 'signed-in' || !Array.isArray(body['providers'])) return undefined
  const providers: ProviderRow[] = []
  for (const entry of body['providers']) {
    const row = readProviderRow(entry)
    if (row !== undefined) providers.push(row)
  }
  return { status: 'ready', providers }
}

/**
 * The line to show for one refusal the host forwarded.
 *
 * The product owns the identifiers; this is the only place that decides which
 * of them the reader sees as which sentence, so an identifier a newer product
 * introduces reads as the generic save failure rather than as nothing at all.
 * @param reason - the product's refusal identifier.
 * @returns the dictionary key to render.
 */
export function failureFor(reason: string): ProviderFailure {
  switch (reason) {
    // The product's managed-row guard. The section already withholds the
    // fields it names, so reaching this line means the row became managed
    // between the read and the save — the reader still gets told why.
    case 'managed_provider_readonly': return 'error.managed'
    case 'not_found': return 'error.notFound'
    case 'prefix_taken': return 'error.prefixExists'
    case 'prefix_format': return 'error.prefixFormat'
    case 'prefix_required': return 'error.prefixRequired'
    case 'api_url_required':
    case 'api_key_required': return 'error.fields'
    case 'api_url_invalid':
    case 'api_url_too_long': return 'error.url'
    case 'byo_provider_limit_reached': return 'error.limit'
    // The host's own stand-in when a delete was refused with no identifier.
    case 'delete_refused': return 'error.deleteFailed'
    default: return 'error.failed'
  }
}

/** The state a source stands in before its first read settles. */
const LOADING: ProvidersState = Object.freeze({ status: 'loading' as const })

/** Everything one state says, as one comparable string. */
function stateKey(state: ProvidersState): string {
  if (state.status !== 'ready') return state.status
  return state.providers.map(row => [
    row.id, row.displayName, row.prefix, row.apiUrl,
    String(row.enabled), String(row.managed),
    row.models.join(','), row.selectedModels.join(','),
  ].join(' ')).join('')
}

/** Observable provider list plus the three gestures this section performs. */
export class ProviderSource {
  private readonly listeners = new Set<() => void>()
  private state: ProvidersState = LOADING
  private disposed = false

  /**
   * @param environment - the browser facilities to use.
   */
  constructor(private readonly environment: ProviderEnvironment) {}

  /**
   * Read the current state.
   * @returns the standing state; the same reference until the list moves.
   */
  getSnapshot(): ProvidersState {
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

  /**
   * Read `/auth/providers` once and publish what it says.
   * @returns a promise settling when the reading has been published.
   */
  async refresh(): Promise<void> {
    const response = await this.environment.request(PROVIDERS_PATH).catch(() => undefined)
    if (response === undefined || !response.ok) {
      this.adopt({ status: 'failed' })
      return
    }
    const body = await response.json().catch(() => undefined) as unknown
    this.adopt(readProvidersResponse(body) ?? { status: 'failed' })
  }

  /**
   * Add one provider to the account.
   *
   * On success the list is re-read rather than patched locally: the product
   * decides what the stored row looks like — it normalises the prefix and
   * fetches the model catalogue — and echoing the submitted draft would show
   * the user something the store does not actually contain.
   * @param draft - the provider the user filled in, credential included.
   * @returns what the attempt established.
   */
  async create(draft: ProviderDraft): Promise<ProviderOutcome> {
    const response = await this.environment.request(PROVIDERS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    }).catch(() => undefined)
    if (response === undefined) return { ok: false, reason: 'error.failed' }
    const body = await response.json().catch(() => undefined) as unknown
    const status = isRecord(body) ? body['status'] : undefined
    if (status === 'created') {
      await this.refresh()
      return { ok: true }
    }
    if (status === 'refused') {
      return { ok: false, reason: failureFor(readString(isRecord(body) ? body['reason'] : '')) }
    }
    // `signed-out` lands here too: the session went away mid-form, and the
    // next read is what will actually say so.
    return { ok: false, reason: 'error.failed' }
  }

  /**
   * Change one provider on the account.
   *
   * As with a create, success re-reads the list rather than patching it
   * locally: the product normalises the prefix and decides what the stored row
   * ends up holding, and a managed row's save is answered by the sync's view
   * of the selection rather than by the boxes that were ticked.
   * @param id - the product's own row id for the provider.
   * @param patch - the fields to change; absent members are left alone.
   * @returns what the attempt established.
   */
  async update(id: string, patch: ProviderPatch): Promise<ProviderOutcome> {
    return this.write(id, { method: 'PATCH', body: patch }, 'updated')
  }

  /**
   * Remove one provider from the account, and with it every model it offered.
   * @param id - the product's own row id for the provider.
   * @returns what the attempt established.
   */
  async remove(id: string): Promise<ProviderOutcome> {
    return this.write(id, { method: 'DELETE' }, 'deleted')
  }

  /** Stop publishing; a read still in flight lands on a closed source. */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  /**
   * Send one write to `/auth/providers/<id>` and republish the list it moved.
   * @param id - the product's own row id for the provider.
   * @param request - the verb, and the patch body when there is one.
   * @param success - the host status that means the write landed.
   * @returns what the attempt established.
   */
  private async write(
    id: string,
    request: { method: 'PATCH'; body: ProviderPatch } | { method: 'DELETE' },
    success: 'updated' | 'deleted',
  ): Promise<ProviderOutcome> {
    const init: RequestInit = request.method === 'DELETE'
      ? { method: 'DELETE' }
      : {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.body),
      }
    const path = `${PROVIDERS_PATH}/${encodeURIComponent(id)}`
    const response = await this.environment.request(path, init).catch(() => undefined)
    if (response === undefined) return { ok: false, reason: 'error.failed' }
    const body = await response.json().catch(() => undefined) as unknown
    const status = isRecord(body) ? body['status'] : undefined
    if (status === success) {
      await this.refresh()
      return { ok: true }
    }
    if (status === 'refused') {
      return { ok: false, reason: failureFor(readString(isRecord(body) ? body['reason'] : '')) }
    }
    // `signed-out` lands here too: the session went away mid-edit, and the
    // next read is what will actually say so.
    return { ok: false, reason: 'error.failed' }
  }

  /**
   * Adopt a state and publish it, if it moved anything.
   * @param next - the state to stand on.
   */
  private adopt(next: ProvidersState): void {
    if (this.disposed) return
    if (stateKey(next) === stateKey(this.state)) return
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
