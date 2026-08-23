/**
 * Translation of the UnieAI account's entitled models into one pi-ai provider
 * route.
 *
 * The product publishes what an account may run, not how to run it: an entry
 * carries an identity (`${prefix}-${modelId}`), a label, and whether it takes
 * images, and deliberately carries neither an endpoint nor a credential. What
 * makes those entries runnable is the product's own relay — one
 * OpenAI-compatible endpoint that resolves the upstream server-side, meters the
 * turn against the plan, and streams back — so every entitled model becomes a
 * model on ONE route pointed at that endpoint, named by the value the relay
 * expects.
 *
 * Capacities are the one thing neither side knows. The product does not report
 * a context window or an output cap, and there is nothing to interrogate: the
 * relay is a facade over whichever provider the account is entitled to. So the
 * route carries deployment-set defaults rather than a guess buried here.
 *
 * @module dsh-llm-unieai-cloud/catalog
 */

import { resolveProfiles } from '@unieai/uad-llm-pi-ai'
import type { PiAiModelProfile, PiAiProviderProfile, ResolvedPiAiProviderProfile } from '@unieai/uad-llm-pi-ai'
import type { EntitledModel } from '@unieai/uad-unieai-web-gate'

/**
 * The wire protocol the relay speaks. Not configurable: the route exists to
 * reach `POST {product}/api/desktop/v1/chat/completions`, which is an
 * OpenAI-compatible completions endpoint by definition, and pointing this
 * route anywhere else would make it a different route.
 */
const RELAY_API = 'openai-completions'

/**
 * Path of the product's desktop inference relay, appended to the gate's
 * product URL. A fact about the product's API, in the same sense as the
 * `/api/desktop/*` paths the gate itself spells out.
 */
const RELAY_PATH = '/api/desktop/v1'

/** What the route needs beyond the models themselves. */
export interface RouteFacts {
  /** The `llm` route key this plugin owns. */
  provider: string
  /** Name shown by model selectors. */
  displayName: string
  /** The web product's origin, without a trailing slash. */
  productUrl: string
  /** Context capacity assumed for every entitled model. */
  defaultContextWindow: number
  /** Output capability assumed for every entitled model. */
  defaultMaxTokens: number
}

/**
 * The absolute endpoint this route sends completions to.
 * @param productUrl - the web product's origin, without a trailing slash.
 * @returns the relay's base URL, which pi-ai appends `/chat/completions` to.
 */
export const relayBaseUrl = (productUrl: string): string => `${productUrl}${RELAY_PATH}`

/**
 * One entitled model as a route entry.
 *
 * The id is the entitled value, not the bare model id: that value is what the
 * relay resolves an upstream from and what the account is billed against, so
 * anything else would name a model the relay cannot serve. The label is what a
 * person recognises, which is why it is the display name even though it is not
 * unique across providers.
 * @param model - one entitled model.
 * @returns the pi-ai model profile for it.
 */
function toModelProfile(model: EntitledModel): PiAiModelProfile {
  return {
    id: model.value,
    name: model.label,
    // Text is the floor every model on this relay certainly takes; images are
    // added only where the product resolved that the model accepts them.
    // Over-claiming would let an image be attached and then rejected mid-turn,
    // after the message is already durable.
    input: model.acceptsImages ? ['text', 'image'] : ['text'],
  }
}

/**
 * Build the route profile for one entitled-model list.
 *
 * An empty list yields no profile at all: a pi-ai route with no models cannot
 * be resolved, and a route that advertises nothing is not a route worth
 * registering. The caller keeps the previous profile in that case rather than
 * dropping a route a person may be mid-turn on.
 * @param models - the account's entitled models.
 * @param facts - the route key, display name, endpoint, and capacity defaults.
 * @returns the resolved profiles keyed by route, or undefined for an empty list.
 */
export function buildRouteProfiles(
  models: readonly EntitledModel[],
  facts: RouteFacts,
): ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined {
  if (models.length === 0) return undefined
  const profile: PiAiProviderProfile = {
    displayName: facts.displayName,
    api: RELAY_API,
    baseURL: relayBaseUrl(facts.productUrl),
    models: models.map(toModelProfile),
    defaultContextWindow: facts.defaultContextWindow,
    defaultMaxTokens: facts.defaultMaxTokens,
    // Deliberately no `apiKeyEnv`. The credential is the gate session's API
    // key, which is minted per sign-in and held in memory; it has no
    // environment-variable name, and giving it one would mean writing a
    // session credential into the durable credential store.
  }
  return resolveProfiles({ [facts.provider]: profile })
}
