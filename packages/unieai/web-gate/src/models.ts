/**
 * Reads the models the signed-in account is entitled to run on the web
 * product, through that product's desktop BFF.
 *
 * Same seam as {@link ./providers.ts}, for the same reason: the API key that
 * authenticates `/api/desktop/*` lives in the gate's session table and must
 * not reach a page. The browser asks the host, the host asks the product, and
 * only the product's answer travels back.
 *
 * **What this list is, and what it is not.** It is the union the web product's
 * own model picker is built from — the account's selected personal-provider
 * models, the models its groups grant, and the global models. Every entry
 * names a model the account may run *on that product*.
 *
 * An entry is runnable, but not by dialling a provider. The product sends no
 * base URL and no credential — `EntitledModel` has no field for either,
 * because the desktop holds a long-lived key on a laptop and copying a
 * server-held provider secret onto it would only widen what a stolen laptop
 * costs. What runs one is the product's own relay,
 * `POST /api/desktop/v1/chat/completions`, which this desktop's API key
 * authenticates and which resolves the upstream, enforces the plan's quota,
 * and meters the turn on the product's side.
 * `@deepseek-ai/dsh-llm-unieai-cloud` registers this list as one `llm` route
 * pointed at that relay.
 *
 * Read-only, and there is deliberately no write direction. Which models an
 * account may run is decided by its providers, its groups, and the platform;
 * none of those is something a desktop could change by naming a model.
 */

/** One entitled model as the product reports it. Carries no credential. */
export interface EntitledModel {
  /**
   * `${prefix}-${modelId}` — the identifier the WEB PRODUCT accepts, and this
   * entry's stable identity. No local runtime knows it.
   */
  value: string
  /** The bare model id, which is what a person recognises in a list. */
  label: string
  /** Which entitlement granted it: a personal provider, a group, or the platform. */
  source: 'personal' | 'group' | 'global'
  /** The routing prefix `value` is built from; empty when the product reported none. */
  prefix: string
  /** The provider's display name; empty when the product reported none. */
  providerName: string
  /** The granting group's name for a group model; empty otherwise. */
  groupName: string
  /** Whether the model takes image input, as the product resolved it. */
  acceptsImages: boolean
  /** `custom_model` for a Studio custom model, `base_model` otherwise. */
  modelType: 'base_model' | 'custom_model'
  /** The harness the model expects; `none` for a plain chat model. */
  agentHarness: 'none' | 'studio_opencode'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/** Narrow the entitlement source, defaulting to the product's own default. */
function readSource(value: unknown): EntitledModel['source'] {
  return value === 'group' || value === 'global' ? value : 'personal'
}

/**
 * Narrow one reported model.
 *
 * An entry with no `value` cannot be addressed or de-duplicated, so it is
 * dropped rather than kept as a model that names nothing. Everything else has
 * a defined absence: no provider name, no group, not a vision model.
 *
 * `modelType` and `agentHarness` fall back to the ordinary case rather than to
 * the special one. A build of the product that predates either field reports
 * a plain chat model, which is what almost every entry is; guessing
 * `studio_opencode` would label the whole catalogue as needing a harness this
 * desktop does not run.
 * @param value - a candidate model object.
 * @returns the model, or undefined when the value is not one.
 */
export function readEntitledModel(value: unknown): EntitledModel | undefined {
  if (!isRecord(value)) return undefined
  const slug = readString(value['value'])
  if (slug === '') return undefined
  const label = readString(value['label'])
  return {
    value: slug,
    // A model with no label is still selectable by its slug, which is a worse
    // name than a real one but a better one than a blank row.
    label: label === '' ? slug : label,
    source: readSource(value['source']),
    prefix: readString(value['prefix']),
    providerName: readString(value['providerName']),
    groupName: readString(value['groupName']),
    acceptsImages: value['acceptsImages'] === true,
    modelType: value['modelType'] === 'custom_model' ? 'custom_model' : 'base_model',
    agentHarness: value['agentHarness'] === 'studio_opencode' ? 'studio_opencode' : 'none',
  }
}

/**
 * Read the account's entitled models.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the models, or undefined when the list could not be read — which
 * the caller reports as a failure rather than as an account entitled to none.
 */
export async function fetchEntitledModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EntitledModel[] | undefined> {
  const response = await fetch(`${baseUrl}/api/desktop/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body) || !Array.isArray(body['models'])) return undefined
  const models: EntitledModel[] = []
  const seen = new Set<string>()
  for (const entry of body['models']) {
    const model = readEntitledModel(entry)
    // The product de-duplicates already; doing it again here costs one set and
    // means a build that does not cannot render the same model twice.
    if (model === undefined || seen.has(model.value)) continue
    seen.add(model.value)
    models.push(model)
  }
  return models
}
