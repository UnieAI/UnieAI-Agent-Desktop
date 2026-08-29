/**
 * The authorization-code grant this seam runs, for a program that has no
 * server of its own.
 *
 * WHY LOOPBACK. A desktop harness cannot receive a redirect on a public
 * address, and the out-of-band "paste this code" flow that used to stand in for
 * one is withdrawn at Google and deprecated everywhere else. RFC 8252 names the
 * remaining answer for a native app: bind a loopback listener on an ephemeral
 * port and register `http://127.0.0.1` as the redirect. The port is the OS's
 * choice, which is why a provider must accept any loopback port rather than one
 * fixed number.
 *
 * WHY PKCE, ALWAYS. A native app cannot keep a client secret — it ships inside
 * the binary — so the code exchange is bound to a verifier this process
 * generated instead. Every provider here is registered as a public client, and
 * no secret is stored, read, or sent.
 *
 * @module @unieai/uad-connector/oauth
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** One PKCE pair: what is sent up front, and what is kept until the exchange. */
export interface PkcePair {
  /** The secret this process keeps; sent only with the code exchange. */
  readonly verifier: string
  /** The S256 digest sent with the authorization request. */
  readonly challenge: string
}

/**
 * Generate a PKCE pair.
 *
 * The verifier is 32 random bytes in base64url — the top of RFC 7636's
 * permitted length, because the whole security of a public client rests on it.
 * @returns the verifier to keep and the challenge to send.
 */
export function createPkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/** What the redirect carried back. */
export interface RedirectResult {
  /** The authorization code to exchange. */
  readonly code: string
}

/** A loopback listener waiting for one redirect. */
export interface LoopbackRedirect {
  /** The redirect URI to send with the authorization request. */
  readonly redirectUri: string
  /**
   * The opaque value to send as `state` and to expect back.
   *
   * Generated with the listener rather than by the caller so the two cannot
   * drift: the listener refuses a redirect carrying any other value, which is
   * what stops anything else that can reach loopback from ending this flow.
   */
  readonly state: string
  /** Settles when the provider redirects back, or rejects on refusal or abort. */
  readonly received: Promise<RedirectResult>
  /** Stop listening; safe to call twice. */
  close(): Promise<void>
}

/** The page the browser is left on, so the person knows to come back. */
function settledPage(message: string): string {
  const text = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const style = 'font:16px/1.6 system-ui;display:grid;place-items:center;height:100vh;margin:0'
  return '<!doctype html><meta charset="utf-8"><title>Rabi</title>'
    + `<body style="${style}"><p>${text}</p>`
}

/**
 * Compare two `state` values without leaking their difference through timing.
 * @param a - the state this process generated.
 * @param b - the state the redirect carried.
 * @returns whether they are the same value.
 */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual refuses unequal lengths, which is itself the answer.
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Listen on loopback for one authorization redirect.
 *
 * The listener answers exactly one request and then refuses the rest: a second
 * redirect to the same port belongs to a flow this process is no longer running.
 * @param signal - abandons the wait when the person withdraws.
 * @returns the redirect URI to use, the eventual code, and the stop.
 */
export async function listenForRedirect(signal: AbortSignal): Promise<LoopbackRedirect> {
  const state = randomBytes(16).toString('base64url')
  let settle: (result: RedirectResult) => void = () => {}
  let fail: (reason: Error) => void = () => {}
  const received = new Promise<RedirectResult>((resolve, reject) => { settle = resolve; fail = reject })
  let done = false

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (done) {
      response.writeHead(410).end()
      return
    }
    const carried = url.searchParams.get('state') ?? ''
    if (!sameState(state, carried)) {
      // Not this flow's redirect: answer nothing and keep waiting, because
      // failing here would let anyone who can reach loopback end the attempt.
      response.writeHead(400).end()
      return
    }
    done = true
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    if (error !== null) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(settledPage('Rabi was not given access. You can close this page.'))
      fail(new Error(`authorization refused: ${error}`))
      return
    }
    if (code === null) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        .end(settledPage('That redirect carried no authorization code.'))
      fail(new Error('authorization redirect carried no code'))
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(settledPage('Rabi is connected. You can close this page.'))
    settle({ code })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    // Loopback only: a listener on every interface would accept a redirect
    // from anywhere on the network.
    server.listen(0, '127.0.0.1', resolve)
  })

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
  const onAbort = (): void => {
    if (done) return
    done = true
    fail(new Error('authorization withdrawn'))
  }
  signal.addEventListener('abort', onAbort, { once: true })
  void received.catch(() => {}).finally(() => { signal.removeEventListener('abort', onAbort) })

  const port = (server.address() as AddressInfo).port
  return { redirectUri: `http://127.0.0.1:${String(port)}/`, state, received, close }
}

/** The provider's answer to a token request, as the two supported ones write it. */
export interface TokenResponse {
  /** The bearer token. */
  readonly access_token: string
  /** Seconds the access token remains valid. */
  readonly expires_in?: number
  /** Present when the provider issues one. */
  readonly refresh_token?: string
  /** Space-separated, and may be narrower than what was asked. */
  readonly scope?: string
  /** OpenID Connect identity, when the scopes asked for it. */
  readonly id_token?: string
}

/**
 * Exchange a form-encoded token request.
 *
 * Both grant types — the initial code and a later refresh — are the same POST
 * to the same endpoint, so they are the same function; only the fields differ.
 * @param tokenUrl - the provider's token endpoint.
 * @param fields - the form fields for this grant.
 * @param signal - abandons the request.
 * @returns the parsed answer.
 * @throws when the provider answers with anything but 2xx, carrying its own message.
 */
export async function requestToken(
  tokenUrl: string,
  fields: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<TokenResponse> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(fields).toString(),
    signal,
  })
  const text = await response.text()
  if (!response.ok) {
    // The provider's own words: "invalid_grant" and its description are what
    // tells a person their approval was revoked rather than that Rabi is broken.
    throw new Error(`token request failed (${String(response.status)}): ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as TokenResponse
}

/**
 * When an access token stops being usable.
 *
 * A minute is taken off the provider's own figure: a token that expires while a
 * request is in flight fails the request, and the clock this process reads is
 * not the provider's.
 * @param expiresIn - the provider's `expires_in`, in seconds.
 * @param now - the current instant.
 * @returns the ISO 8601 expiry to store.
 */
export function expiryFrom(expiresIn: number | undefined, now: Date): string {
  const seconds = expiresIn ?? 3600
  return new Date(now.getTime() + Math.max(0, seconds - 60) * 1000).toISOString()
}

/** What a dynamic client registration answers with. */
export interface RegisteredClient {
  /** The client id to use for this registration. */
  readonly client_id: string
  /** Present when the provider issued one; a public client is not required to have it. */
  readonly client_secret?: string
}

/**
 * Register a client with a provider that offers it (RFC 7591).
 *
 * The redirect the app is already listening on is declared here, which is what
 * makes this work for a desktop program: the provider accepts a loopback
 * redirect because the client asked for it as part of its own registration,
 * rather than because someone typed it into a developer console.
 * @param registrationUrl - the provider's registration endpoint.
 * @param redirectUri - the loopback redirect this attempt is listening on.
 * @param clientName - how the registration should name this application.
 * @param signal - abandons the request.
 * @returns the issued client id, and a secret when the provider issued one.
 * @throws when the provider refuses, carrying its own message.
 */
export async function registerClient(
  registrationUrl: string,
  redirectUri: string,
  clientName: string,
  signal: AbortSignal,
): Promise<RegisteredClient> {
  const response = await fetch(registrationUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    signal,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`client registration failed (${String(response.status)}): ${text.slice(0, 400)}`)
  }
  const registered = JSON.parse(text) as Partial<RegisteredClient>
  if (typeof registered.client_id !== 'string' || registered.client_id === '') {
    throw new Error('client registration returned no client_id')
  }
  return registered as RegisteredClient
}

/** The fields this seam reads from an authorization server's metadata. */
export interface ServerMetadata {
  /** Where the person is sent to approve. */
  readonly authorization_endpoint: string
  /** Where codes and refresh tokens are exchanged. */
  readonly token_endpoint: string
  /** Where a client registers itself, when the server offers it. */
  readonly registration_endpoint?: string
  /** The PKCE methods the server accepts. */
  readonly code_challenge_methods_supported?: readonly string[]
}

/**
 * Read one authorization server's own metadata (RFC 8414).
 *
 * Preferred over endpoints written down here, because the server is the
 * authority on its own addresses and a copied URL goes stale silently. It also
 * answers the question that decides whether a deployment needs a client id at
 * all: a server advertising `registration_endpoint` issues clients on demand.
 * @param issuer - the server's issuer origin, e.g. `https://mcp.notion.com`.
 * @param signal - abandons the request.
 * @returns the endpoints it advertises.
 * @throws when the document is missing, unreadable, or omits an endpoint.
 */
export async function discoverServer(issuer: string, signal: AbortSignal): Promise<ServerMetadata> {
  const url = new URL('/.well-known/oauth-authorization-server', issuer)
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
  if (!response.ok) {
    throw new Error(`${issuer} published no authorization-server metadata (${String(response.status)})`)
  }
  const metadata = await response.json() as Partial<ServerMetadata>
  if (typeof metadata.authorization_endpoint !== 'string' || typeof metadata.token_endpoint !== 'string') {
    throw new Error(`${issuer} published metadata without the endpoints this flow needs`)
  }
  // A server that does not accept S256 cannot protect a public client's code
  // exchange, and this seam has no secret to fall back on.
  const methods = metadata.code_challenge_methods_supported
  if (methods !== undefined && !methods.includes('S256')) {
    throw new Error(`${issuer} does not accept S256, which a program with no client secret depends on`)
  }
  return metadata as ServerMetadata
}
