/**
 * Service Definition for the connector capability seam (`ctx.connectors`): the
 * external services this harness has been given access to, and the access
 * token a caller needs to reach one.
 *
 * The seam owns three things and nothing else — which connectors exist, whether
 * one is connected, and a token that is valid right now. It owns no protocol:
 * the human conversation belongs to `ctx.authorization`, the durable grant
 * belongs to `ctx.credentials` as a `GrantRecord`, and what a connector is
 * *for* belongs to whatever registers tools against it.
 *
 * WHY THE GRANT LIVES IN `credentials`. `modifyRecord` is a serialized
 * read-modify-write that holds across processes, and its documentation names
 * this exact case: two processes rotating one refresh token concurrently would
 * otherwise lose whichever wrote first, leaving a person disconnected with no
 * way to tell why. A store of this package's own would have to earn that
 * property again.
 *
 * @module @unieai/uad-connector
 */

import { Context, Service } from '@unieai/cordis'
import { credentialKey } from '@unieai/uad-credentials'
import type { CredentialKey, CredentialRecord } from '@unieai/uad-credentials'
import type {} from '@unieai/uad-authorization'
import { SHIPPED } from './catalogue.ts'
import { createPkce, discoverServer, expiryFrom, listenForRedirect, registerClient, requestToken } from './oauth.ts'
import type { ConnectorGrant, ConnectorProvider, ConnectorStatus } from './types.ts'

export type { ConnectorGrant, ConnectorProvider, ConnectorStatus, DiscoveredDescriptor, OAuth2Descriptor } from './types.ts'
export { GOOGLE_AUTH, GOOGLE_SCOPES, MICROSOFT_AUTH, MICROSOFT_SCOPES } from './providers.ts'
export { REGISTERED, SELF_REGISTERING, SHIPPED } from './catalogue.ts'
export { createPkce, discoverServer, expiryFrom, listenForRedirect, registerClient, requestToken } from './oauth.ts'
export type { LoopbackRedirect, PkcePair, RedirectResult, RegisteredClient, ServerMetadata, TokenResponse } from './oauth.ts'

/** The credential-record scope every connector grant is filed under. */
export const CONNECTOR_SCOPE = 'connector'

/**
 * Where one provider's grant is stored.
 * @param provider - the provider id.
 * @returns the record key.
 */
export function connectorKey(provider: string): CredentialKey {
  return credentialKey(CONNECTOR_SCOPE, provider)
}

/**
 * Whether a stored record is this package's grant for this provider.
 *
 * The provider is checked as well as the shape: a record filed under the wrong
 * key would otherwise hand one service's token to another.
 * @param record - the record as storage returned it.
 * @param provider - the provider the caller asked about.
 * @returns the grant, or undefined when the record is not one.
 */
export function grantOf(record: CredentialRecord | undefined, provider: string): ConnectorGrant | undefined {
  if (record?.kind !== 'grant') return undefined
  const payload = record.payload as Partial<ConnectorGrant> | null
  if (payload === null || typeof payload !== 'object') return undefined
  if (payload.provider !== provider) return undefined
  if (typeof payload.accessToken !== 'string' || typeof payload.expiresAt !== 'string') return undefined
  return payload as ConnectorGrant
}

/**
 * Whether a grant's access token can still be used.
 * @param grant - the stored grant.
 * @param now - the current instant.
 * @returns true while the token is inside its stored expiry.
 */
export function isFresh(grant: ConnectorGrant, now: Date): boolean {
  return Date.parse(grant.expiresAt) > now.getTime()
}


/**
 * The account an OpenID Connect identity token names.
 *
 * The token is NOT verified here, and it is used for nothing but a label: it
 * arrived over TLS from the token endpoint this flow just called, and the
 * access it accompanies is proved by the token endpoint rather than by this
 * claim. A caller that needs an authenticated identity must verify it itself.
 * @param idToken - the `id_token` the provider returned, when it returned one.
 * @returns the email or subject it names, or undefined.
 */
export function accountOf(idToken: string | undefined): string | undefined {
  if (idToken === undefined) return undefined
  const body = idToken.split('.')[1]
  if (body === undefined) return undefined
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    const email = claims['email']
    if (typeof email === 'string' && email !== '') return email
    const subject = claims['sub']
    return typeof subject === 'string' && subject !== '' ? subject : undefined
  } catch {
    // A token this process cannot read is a label it cannot show; the grant
    // itself is unaffected, so the connection still succeeds without a name.
    return undefined
  }
}


/** The endpoints one attempt actually uses, however the provider stated them. */
export interface Endpoints {
  /** Where the person is sent to approve. */
  readonly authorizationUrl: string
  /** Where codes and refresh tokens are exchanged. */
  readonly tokenUrl: string
  /** Where a client registers itself, when this provider issues them on demand. */
  readonly registrationUrl?: string
  /** Extra authorization-request parameters this provider requires. */
  readonly authorizationParams?: Readonly<Record<string, string>>
  /** The access to ask for. */
  readonly scopes: readonly string[]
}

/**
 * Resolve a provider's endpoints, reading the server's own metadata when the
 * provider is named by issuer rather than by URL.
 *
 * The one place that knows the descriptor is a union; everything downstream
 * sees a single shape, so adding a third way to state a provider changes this
 * function and nothing else.
 * @param provider - the connector being connected.
 * @param signal - abandons a discovery request.
 * @returns the endpoints and the access to ask for.
 */
export async function resolveEndpoints(provider: ConnectorProvider, signal: AbortSignal): Promise<Endpoints> {
  if (provider.auth.kind === 'oauth2') {
    return {
      authorizationUrl: provider.auth.authorizationUrl,
      tokenUrl: provider.auth.tokenUrl,
      ...provider.auth.registrationUrl === undefined ? {} : { registrationUrl: provider.auth.registrationUrl },
      ...provider.auth.authorizationParams === undefined ? {} : { authorizationParams: provider.auth.authorizationParams },
      scopes: provider.scopes,
    }
  }
  const metadata = await discoverServer(provider.auth.issuer, signal)
  return {
    authorizationUrl: metadata.authorization_endpoint,
    tokenUrl: metadata.token_endpoint,
    ...metadata.registration_endpoint === undefined ? {} : { registrationUrl: metadata.registration_endpoint },
    scopes: provider.auth.scopes ?? provider.scopes,
  }
}

/** Configuration for the connector seam. */
export interface Config {
  /**
   * The OAuth client id registered for each provider, keyed by provider id.
   *
   * A deployment fact, not a constant: the client id identifies the
   * application on the consent screen, and a fork or a self-hosted build is a
   * different application. A provider with no client id here is listed and
   * refuses to connect, naming what is missing — silently hiding it would look
   * like the connector does not exist.
   */
  readonly clientIds?: Readonly<Record<string, string>>
  /**
   * How this application names itself when it registers with a provider that
   * issues clients on demand. Shown to the person on the consent screen.
   */
  readonly clientName?: string
}

declare module '@unieai/cordis' {
  interface Events {
    /**
     * A connector's approval page is ready to be opened.
     *
     * Emitted rather than opened here: which surface shows a URL — a browser,
     * a notice in a chat, a printed line in a terminal — is the shell's answer,
     * and a seam that opened a browser itself would be wrong everywhere it is
     * not one.
     * @param provider - the connector being connected.
     * @param url - the provider's authorization page, complete with this attempt's state.
     * @mode emit
     */
    'connectors/authorize'(provider: string, url: string): void
  }
  interface Context {
    connectors: Connectors
  }
}

/**
 * The connector book: which services can be connected, which are, and the
 * token to reach one with.
 */
export class Connectors extends Service {
  private readonly providers = new Map<string, ConnectorProvider>()

  /**
   * @param ctx - the context this service is provided on.
   * @param config - the deployment's client ids.
   */
  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'connectors')
  }

  /**
   * Offer one connector.
   *
   * Registration is an effect: the connector disappears with the plugin that
   * offered it, and a grant already stored survives, because a person's
   * approval is not this process's to discard.
   * @param provider - the connector to offer.
   * @returns the disposer.
   */
  register(provider: ConnectorProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new Error(`connectors.register: ${provider.id} is already offered`)
    }
    this.providers.set(provider.id, provider)
    return () => { this.providers.delete(provider.id) }
  }

  /**
   * Every connector, connected or not.
   * @returns one status per offered connector, in registration order.
   */
  async list(): Promise<readonly ConnectorStatus[]> {
    const out: ConnectorStatus[] = []
    for (const provider of this.providers.values()) out.push(await this.status(provider.id))
    return out
  }

  /**
   * One connector's state.
   * @param id - the provider id.
   * @returns its status.
   * @throws when no such connector is offered.
   */
  async status(id: string): Promise<ConnectorStatus> {
    const provider = this.providerOr(id)
    const grant = grantOf(await this.ctx.credentials.readRecord(connectorKey(id)), id)
    const requiresClientId = this.requiresClientId(provider)
    if (grant === undefined) {
      return { id, label: provider.label, connected: false, scopes: [], renewable: false, requiresClientId }
    }
    return {
      id,
      label: provider.label,
      connected: true,
      ...grant.account === undefined ? {} : { account: grant.account },
      scopes: grant.scopes,
      expiresAt: grant.expiresAt,
      renewable: grant.refreshToken !== undefined,
      requiresClientId,
    }
  }

  /**
   * Whether this provider would refuse for want of a client id, decided
   * without reaching the network.
   *
   * Only a provider whose endpoints are written down can be judged here: an
   * issuer's registration endpoint is in metadata this must not fetch to list
   * a connector.
   * @param provider - the offered connector.
   * @returns true when connecting it needs an id the deployment has not set.
   */
  private requiresClientId(provider: ConnectorProvider): boolean {
    if (provider.auth.kind !== 'oauth2' || provider.auth.registrationUrl !== undefined) return false
    const clientId = this.config.clientIds?.[provider.id]
    return clientId === undefined || clientId === ''
  }

  /**
   * A token that is valid right now, refreshing first when the stored one has
   * expired.
   *
   * The refresh runs inside `modifyRecord`, so two callers that both find an
   * expired token do not both spend the refresh token — the second sees what
   * the first wrote.
   * @param id - the provider id.
   * @param signal - abandons a refresh in flight.
   * @returns the bearer token.
   * @throws when the connector is not connected, or the provider refused the refresh.
   */
  async token(id: string, signal: AbortSignal): Promise<string> {
    const provider = this.providerOr(id)
    const key = connectorKey(id)
    const stored = grantOf(await this.ctx.credentials.readRecord(key), id)
    if (stored === undefined) throw new Error(`connectors.token: ${id} is not connected`)
    if (isFresh(stored, new Date())) return stored.accessToken

    const written = await this.ctx.credentials.modifyRecord(key, async (current) => {
      const now = grantOf(current, id)
      if (now === undefined) throw new Error(`connectors.token: ${id} is not connected`)
      // Someone else refreshed while this call waited for the lock.
      if (isFresh(now, new Date())) return undefined
      if (now.refreshToken === undefined) {
        throw new Error(`connectors.token: ${id} issued no refresh token, so it must be connected again`)
      }
      const answer = await requestToken((await resolveEndpoints(provider, signal)).tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: now.refreshToken,
        client_id: now.clientId ?? this.clientIdOr(id),
      }, signal)
      // A provider that rotates refresh tokens returns a new one; one that does
      // not returns none, and the stored one stays valid.
      const grant: ConnectorGrant = {
        ...now,
        accessToken: answer.access_token,
        expiresAt: expiryFrom(answer.expires_in, new Date()),
        ...answer.refresh_token === undefined ? {} : { refreshToken: answer.refresh_token },
      }
      return { kind: 'grant', payload: grant }
    })
    const fresh = grantOf(written, id)
    if (fresh === undefined) throw new Error(`connectors.token: ${id} is not connected`)
    return fresh.accessToken
  }


  /**
   * Connect one connector: run the approval, and store what it returned.
   *
   * The conversation is `ctx.authorization`'s — this method contributes the
   * protocol and nothing about how the person is asked, so a surface that can
   * render one authorization renders this one.
   * @param id - the provider id.
   * @param signal - abandons the attempt when the person withdraws.
   * @returns the connector's state once the grant is stored.
   * @throws when the provider refuses, or the deployment registered no client id.
   */
  async connect(id: string, signal: AbortSignal): Promise<ConnectorStatus> {
    const provider = this.providerOr(id)
    const endpoints = await resolveEndpoints(provider, signal)
    const pkce = createPkce()
    const redirect = await listenForRedirect(signal)
    try {
      // A provider that registers clients on demand is handed the redirect this
      // attempt is already listening on, so a fresh install connects with no
      // application registered anywhere. Everything else needs the id a person
      // registered, and says so rather than failing at the provider.
      const clientId = endpoints.registrationUrl === undefined
        ? this.clientIdOr(id)
        : (await registerClient(endpoints.registrationUrl, redirect.redirectUri, this.config.clientName ?? 'Rabi', signal)).client_id
      const url = new URL(endpoints.authorizationUrl)
      for (const [key, value] of Object.entries(endpoints.authorizationParams ?? {})) {
        url.searchParams.set(key, value)
      }
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirect.redirectUri)
      url.searchParams.set('scope', endpoints.scopes.join(' '))
      url.searchParams.set('state', redirect.state)
      url.searchParams.set('code_challenge', pkce.challenge)
      url.searchParams.set('code_challenge_method', 'S256')

      this.ctx.emit('connectors/authorize', id, url.toString())
      const { code } = await redirect.received
      const answer = await requestToken(endpoints.tokenUrl, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirect.redirectUri,
        code_verifier: pkce.verifier,
      }, signal)

      const grant: ConnectorGrant = {
        provider: id,
        // Kept with the grant: a client registered on demand belongs to this
        // registration, and the refresh must present the same one.
        clientId,
        accessToken: answer.access_token,
        expiresAt: expiryFrom(answer.expires_in, new Date()),
        // What the provider granted, which a person may have narrowed on the
        // consent screen; the asked-for list would be a claim, not a fact.
        scopes: answer.scope === undefined ? [...endpoints.scopes] : answer.scope.split(' ').filter(Boolean),
        ...answer.refresh_token === undefined ? {} : { refreshToken: answer.refresh_token },
        ...accountOf(answer.id_token) === undefined ? {} : { account: accountOf(answer.id_token) as string },
      }
      await this.ctx.credentials.modifyRecord(connectorKey(id), () => Promise.resolve({ kind: 'grant', payload: grant }))
      return await this.status(id)
    } finally {
      await redirect.close()
    }
  }

  /**
   * Forget one connector's grant.
   *
   * Local only: the approval still stands with the provider until the person
   * withdraws it there, and saying otherwise would be a claim this program
   * cannot keep.
   * @param id - the provider id.
   */
  async disconnect(id: string): Promise<void> {
    this.providerOr(id)
    await this.ctx.credentials.deleteRecord(connectorKey(id))
  }

  /**
   * The registered client id, or a refusal naming what is missing.
   * @param id - the provider id.
   * @returns the client id.
   * @throws when the deployment registered none.
   */
  private clientIdOr(id: string): string {
    const clientId = this.config.clientIds?.[id]
    if (clientId === undefined || clientId === '') {
      throw new Error(
        `connectors: no OAuth client id is configured for ${id}. `
        + `Register an application with that provider and set connectors.clientIds.${id}.`,
      )
    }
    return clientId
  }

  /**
   * The offered provider, or a refusal.
   * @param id - the provider id.
   * @returns the provider.
   * @throws when no such connector is offered.
   */
  private providerOr(id: string): ConnectorProvider {
    const provider = this.providers.get(id)
    if (provider === undefined) throw new Error(`connectors: no connector is offered as ${id}`)
    return provider
  }
}

/** Cordis plugin name. */
export const name = 'connectors'

/** Services this plugin needs before it can offer anything. */
export const inject = ['credentials']

/**
 * Mount the connector book and offer the shipped catalogue.
 *
 * Registration is an effect, so unloading the plugin withdraws the connectors
 * and leaves every stored grant where it is — a person's approval is not this
 * process's to discard.
 * @param ctx - the context to provide `connectors` on.
 * @param config - the deployment's client ids and application name.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const connectors = new Connectors(ctx, config)
  for (const provider of SHIPPED) {
    ctx.effect(() => connectors.register(provider), `connectors: ${provider.id}`)
  }
}
