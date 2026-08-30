/**
 * What a connector is, and what connecting one leaves behind.
 *
 * @module @unieai/uad-connector/types
 */

/** An OAuth 2.0 authorization-code provider, as its documentation states it. */
export interface OAuth2Descriptor {
  /** Discriminant; the seam admits one grant shape today. */
  readonly kind: 'oauth2'
  /** Where the person is sent to approve. */
  readonly authorizationUrl: string
  /** Where a code and a refresh token are exchanged. */
  readonly tokenUrl: string
  /**
   * Extra query parameters the provider requires on the authorization request.
   *
   * Google needs `access_type=offline` and `prompt=consent` or it returns no
   * refresh token on a repeat approval — an app that then looks connected
   * stops working the moment the first access token expires.
   */
  readonly authorizationParams?: Readonly<Record<string, string>>
  /**
   * Where this provider registers a client on demand (RFC 7591), when it does.
   *
   * A provider with this endpoint needs NO client id from the deployment: the
   * app registers itself at connect time, declaring the loopback redirect it
   * is already listening on, and is handed a client id for that registration.
   * That removes the one thing a desktop app cannot otherwise do without a
   * developer account — which is why a connector with this endpoint works on a
   * fresh install and one without it waits for someone to register an
   * application.
   */
  readonly registrationUrl?: string
}

/**
 * A provider that publishes its own endpoints (RFC 8414), named by issuer.
 *
 * Preferred to writing the three URLs down: the server is the authority on its
 * own addresses, and its metadata also says whether it issues clients on
 * demand — which is the difference between a connector that works on a fresh
 * install and one that waits for someone to register an application.
 */
export interface DiscoveredDescriptor {
  /** Discriminant. */
  readonly kind: 'discovered'
  /** The issuer origin whose `/.well-known/oauth-authorization-server` is read. */
  readonly issuer: string
  /** The access to ask for, when the server expects any. */
  readonly scopes?: readonly string[]
}

/** One external service this harness can be connected to. */
export interface ConnectorProvider {
  /** Stable id; also the credential record's id segment. */
  readonly id: string
  /** How a person sees it named. */
  readonly label: string
  /** How connecting works: endpoints written down, or read from the server. */
  readonly auth: OAuth2Descriptor | DiscoveredDescriptor
  /**
   * The access this connector asks for, exactly as the provider spells it.
   *
   * Declared per provider rather than per install because the scopes are what
   * the person approves on the consent screen: a deployment that quietly
   * widened them would collect an approval nobody gave.
   */
  readonly scopes: readonly string[]
}

/**
 * What is stored after a successful connection: the `GrantRecord` payload this
 * package owns.
 *
 * `refreshToken` is absent for a provider that issues none, and its absence is
 * the difference between a connection that survives an hour and one that
 * survives a month — surfaces say so rather than discovering it at expiry.
 */
export interface ConnectorGrant {
  /** Which provider this grant belongs to; guards a misfiled record. */
  readonly provider: string
  /**
   * The client id this grant was issued to.
   *
   * Stored rather than re-read from configuration because a dynamically
   * registered client belongs to one registration: a refresh presenting a
   * different id is refused, and the person would be disconnected with no
   * explanation.
   */
  readonly clientId?: string
  /** The bearer token calls carry. */
  readonly accessToken: string
  /** Present when the provider issued one. */
  readonly refreshToken?: string
  /** ISO 8601 instant the access token stops being accepted. */
  readonly expiresAt: string
  /** The scopes the provider actually granted, which may be fewer than asked. */
  readonly scopes: readonly string[]
  /** Who approved it, when the provider says; shown so a person can tell accounts apart. */
  readonly account?: string
}

/** One connector as a surface lists it. */
export interface ConnectorStatus {
  /** The provider's id. */
  readonly id: string
  /** How a person sees it named. */
  readonly label: string
  /** Whether a grant is stored. */
  readonly connected: boolean
  /** The account that approved it, when the provider named one. */
  readonly account?: string
  /** What was actually granted; empty while disconnected. */
  readonly scopes: readonly string[]
  /** When the stored access token expires; absent while disconnected. */
  readonly expiresAt?: string
  /**
   * Whether the connection can outlive its access token.
   *
   * False means the provider issued no refresh token, so this connection ends
   * at `expiresAt` and the person will have to approve again.
   */
  readonly renewable: boolean
  /**
   * Whether connecting needs an OAuth client id this deployment has not been
   * given.
   *
   * True is a refusal a surface can show BEFORE someone presses the button:
   * the provider states its endpoints as URLs, offers no registration
   * endpoint, and `connectors.clientIds` names no id for it. A person then
   * reads that an application has to be registered instead of watching an
   * approval fail.
   *
   * A provider named by ISSUER answers false without discovering: whether that
   * server still offers registration is a network fact, and listing connectors
   * must not depend on reaching every one of them. Such a provider that turns
   * out to offer no registration refuses at connect time with the same words.
   */
  readonly requiresClientId: boolean
}
