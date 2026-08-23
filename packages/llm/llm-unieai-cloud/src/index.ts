/**
 * @unieai/uad-llm-unieai-cloud — the UnieAI account's models, made
 * runnable.
 *
 * The web product knows which models an account may run and refuses to send a
 * desktop the credential that would run one — a key on a laptop spends the
 * account's allowance with nothing on the product able to count it. What it
 * publishes instead is a relay: `POST {product}/api/desktop/v1/chat/completions`,
 * authenticated by the desktop API key, which resolves the upstream
 * server-side, enforces the plan's quota, meters the turn, and streams back.
 *
 * This plugin is the desktop half of that arrangement. It registers ONE `llm`
 * route pointed at the relay, whose models are the account's entitled models
 * and whose credential is the gate session's API key. Nothing about the route
 * comes from a composition file: both halves are facts about who is signed in.
 *
 * ```yaml
 * - id: llm-unieai-cloud
 *   name: '@unieai/uad-llm-unieai-cloud'
 * ```
 *
 * **Signed out, the route offers nothing.** `credentialReady` answers `false`
 * whenever the gate holds no session, which is the seam
 * `buildModelCatalog` drops a whole route on — so a signed-out desktop shows no
 * cloud models rather than a menu of names that fail the moment they are
 * chosen. Before the first sign-in the route is not registered at all, because
 * there is no catalog to register it with.
 *
 * The adapter itself is `dsh-llm-pi-ai`'s. Only the two things a settings
 * document would normally supply — the catalog and the credential — are
 * answered from the sign-in gate instead.
 *
 * @module @unieai/uad-llm-unieai-cloud
 */

import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { LlmError } from '@unieai/uad-llm'
import type { AdapterRegistrationHandle } from '@unieai/uad-llm'
import { authContextFrom, credentialStoreFrom, PiAiAdapter } from '@unieai/uad-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@unieai/uad-llm-pi-ai'
import { MAX_TIMER_DELAY_MS } from '@unieai/uad-timeout'
// Side-effect type import: pulls the `unieaiGate` service and the
// `unieai-gate/session` event declaration onto Context.
import type {} from '@unieai/uad-unieai-web-gate'
import { buildRouteProfiles } from './catalog.ts'

export { buildRouteProfiles, relayBaseUrl } from './catalog.ts'
export type { RouteFacts } from './catalog.ts'

/** Plugin name for the Loader. */
export const name = 'llm-unieai-cloud'
/** Required services: the LLM registry, and the gate that holds the account. */
export const inject = ['llm', 'unieaiGate']

/** Deployment configuration. */
export interface Config {
  /**
   * The `llm` route key this plugin owns. Configurable only because a route
   * key is global across adapter families: a deployment that already runs a
   * route called `unieai` needs somewhere to move this one.
   */
  provider: string
  /** Name shown by model selectors for the whole route. */
  displayName: string
  /**
   * Context capacity assumed for every entitled model. A guess by
   * construction: the product reports no capacity, and the relay is a facade
   * over whichever upstream the account is entitled to, so there is nothing to
   * interrogate. A deployment whose plan serves smaller models corrects it.
   */
  defaultContextWindow: number
  /** Output capability assumed for every entitled model; a guess on the same terms. */
  defaultMaxTokens: number
  /**
   * How often the entitled-model list is re-read while signed in.
   *
   * Entitlement changes on the product — a provider added from this desktop's
   * own API Providers section changes it — and the product sends no signal
   * when it does, so the list is re-read on a clock. It is not a credential
   * refresh: the session's API key lives as long as the session.
   */
  catalogRefreshMs: number
}

/** Schema for {@link Config}. */
export const Config: z<Config> = z.object({
  provider: z.string().default('unieai'),
  displayName: z.string().default('UnieAI'),
  defaultContextWindow: z.number().step(1).min(1).default(131_072),
  defaultMaxTokens: z.number().step(1).min(1).default(16_384),
  catalogRefreshMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(15 * 60 * 1000),
})

/**
 * Register the account's cloud models as one runnable route.
 * @param ctx - Cordis context carrying `llm` and `unieaiGate`.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  /**
   * The route's current profiles, or an empty map before the first successful
   * read. Replaced wholesale, never mutated: `PiAiAdapter` recognises an
   * unchanged configuration by this map's identity and rebuilds its pi-ai
   * collection whenever it changes.
   */
  let profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> = new Map()
  let registration: AdapterRegistrationHandle | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  /**
   * Read through a call rather than the binding: the checks below straddle
   * `await` points, and a narrowed `let` would let one of them be optimized
   * away as always-false — the whole point is that the disposer flipped it
   * while the read was suspended.
   */
  const isDisposed = (): boolean => disposed
  /** Serializes reads, so two of them cannot install catalogs out of order. */
  let queue: Promise<void> = Promise.resolve()

  const session = (): { userId: string; apiKey: string } | undefined => ctx.unieaiGate.session()

  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: (provider) => {
      const current = session()
      if (current !== undefined) return Promise.resolve(current.apiKey)
      // Loud rather than unauthenticated. A turn that reached this point was
      // started against a route the catalog should already have hidden, and
      // the relay's own answer to a missing bearer is a 401 the agent loop
      // would report as a provider outage.
      throw new LlmError(
        `llm-unieai-cloud: provider route "${provider}" needs a UnieAI sign-in; this desktop holds no session,`
        + ' so there is no credential to send to the account\'s inference relay — sign in at /auth/login',
        'MISSING_CREDENTIAL',
      )
    },
    // The one fact every surface asks before offering a model. `false` is a
    // definite answer here, not an unknown: whether a session exists is
    // something this host knows for certain.
    credentialReady: () => Promise.resolve(session() !== undefined),
    auth: { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) },
    resolveAttachments: () => ctx.get('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-unieai-cloud: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })

  const clearTimer = (): void => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  const schedule = (): void => {
    clearTimer()
    if (isDisposed()) return
    timer = setTimeout(() => {
      timer = undefined
      void enqueue()
    }, config.catalogRefreshMs)
    // Background maintenance of a catalog: it must not hold the process open.
    timer.unref()
  }

  /**
   * Install a catalog and, the first time there is one, register the route.
   *
   * The route is never withdrawn afterwards. A signed-out desktop keeps the
   * registration and answers `credentialReady` false, which is what takes the
   * models out of every selector; withdrawing the route instead would make the
   * adapter answer "not mine" — an unknown, not a refusal — and an unknown is
   * deliberately not enough to hide anything.
   */
  const install = (next: ReadonlyMap<string, ResolvedPiAiProviderProfile>): void => {
    profiles = next
    if (registration !== undefined) return
    registration = ctx.llm.registerAdapter([config.provider], adapter)
  }

  /** Re-read the account's entitlement and install what it reports. */
  const refresh = async (): Promise<void> => {
    if (isDisposed()) return
    if (session() === undefined) {
      // Nothing to read, and nothing to withdraw: the last catalog stays put
      // so the registered route can keep answering `credentialReady` false.
      clearTimer()
      return
    }
    const models = await ctx.unieaiGate.entitledModels().catch(() => undefined)
    if (isDisposed()) return
    if (models === undefined) {
      ctx.logger.warn('llm-unieai-cloud: the UnieAI entitled-model list could not be read; keeping the previous catalog')
      schedule()
      return
    }
    const next = buildRouteProfiles(models, {
      provider: config.provider,
      displayName: config.displayName,
      productUrl: ctx.unieaiGate.productUrl,
      defaultContextWindow: config.defaultContextWindow,
      defaultMaxTokens: config.defaultMaxTokens,
    })
    // An account entitled to nothing keeps whatever was registered rather than
    // emptying the route: a pi-ai route with no models cannot be resolved at
    // all, so there is no such thing as installing an empty one.
    if (next !== undefined) install(next)
    schedule()
  }

  /** Run one read after every one already queued. */
  const enqueue = (): Promise<void> => {
    queue = queue.then(refresh, refresh).catch((error: unknown) => {
      ctx.logger.error('llm-unieai-cloud: refreshing the UnieAI model catalogue failed')
      ctx.logger.error(error)
    })
    return queue
  }

  // A session may already exist when this plugin mounts, so the first read is
  // not waiting for an event that has already happened.
  ctx.on('unieai-gate/session', () => { void enqueue() })
  void enqueue()

  ctx.effect(() => () => {
    disposed = true
    clearTimer()
    // Chained onto the queue: a read in flight would otherwise register the
    // route after the disposer had already released it.
    return queue.then(() => {
      registration?.()
      registration = undefined
    })
  }, 'llm-unieai-cloud: cloud model route')
}
