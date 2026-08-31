/**
 * @unieai/uad-unieai-web-gate — the browser sign-in gate.
 *
 * Two things live here because they are one decision:
 *
 *  - the `/auth/*` routes and the server-rendered sign-in page, which run
 *    before any client bundle exists; and
 *  - the WebServer guard that decides whether a request reaches dispatch.
 *
 * The guard is the fence. A gate built inside the client plugin tree could not
 * be one: `client/runtime` opens the downlinks and issues its first RPC during
 * the plugin stage, before React mounts, so anything rendered afterwards is a
 * curtain in front of a stage that is already running — and `curl` never sees
 * the curtain at all.
 *
 * Identity comes from the UnieAI Copilot web product over a device-code grant
 * ({@link ./device.ts}). Authorisation is separate and deliberate: this host
 * runs one agent with `bash` and the filesystem tools, so admitting *any* valid
 * account would hand arbitrary code execution to anyone who can register with
 * the product. The first account to sign in claims the instance; later accounts
 * are refused unless an explicit allowlist says otherwise.
 */

import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
// Side-effect type import: pulls the `webServer` declaration merge onto Context.
import type {} from '@unieai/uad-host-webserver'
import { fetchAccountSnapshot } from './account.ts'
import { BootstrapWarmup } from './bootstrap.ts'
import { pollDeviceLogin, startDeviceLogin, type DeviceSession } from './device.ts'
import { renderLoginPage } from './page.ts'
import { readInviteEmail, sendInvite } from './invite.ts'
import { fetchMcpServers, toMcpServerView } from './mcp.ts'
import type { McpServerGrant } from './mcp.ts'
import { fetchEntitledModels } from './models.ts'
import type { EntitledModel } from './models.ts'
import { fetchAccountProfile, updateAccountProfile, type ProfilePatch } from './profile.ts'
import {
  createProvider, deleteProvider, fetchProviders, readProviderDraft, readProviderPatch, updateProvider,
} from './providers.ts'
import {
  accountSkillsFailureMessage, fetchAccountSkill, fetchAccountSkills, isPlainSegment,
} from './skills.ts'
import type { AccountSkillDocument, SkillDocumentFailure } from './skills.ts'
import { fetchDesktopStats } from './stats.ts'

export type { BootstrapAnswer, BootstrapPart, BootstrapPartReader } from './bootstrap.ts'
export type { DeviceGrant, DeviceSession, PollOutcome } from './device.ts'
export type { AccountMeter, AccountSnapshot } from './account.ts'
export type { InviteSendOutcome, SentInvite } from './invite.ts'
export type { McpServerGrant, McpServerView } from './mcp.ts'
export type { EntitledModel } from './models.ts'
export type { AccountSkill, AccountSkillDocument, SkillDocumentFailure } from './skills.ts'
export type { AccountProfile, ProfileRefusal, ProfilePatch, ProfileWriteOutcome } from './profile.ts'
export type {
  ProviderCreateOutcome, ProviderDeleteOutcome, ProviderDraft, ProviderPatch, ProviderSummary,
  ProviderUpdateOutcome,
} from './providers.ts'
export type { DesktopDailyPoint, DesktopStats } from './stats.ts'

/**
 * The signed-in account, as this host holds it.
 *
 * The API key is a member because a host plugin that dials the product on the
 * account's behalf needs it as a bearer, and there is nowhere else on this
 * host that holds one. It is a HOST-side value in the strictest sense: no
 * `/auth/*` answer carries it, and nothing that reaches a page may.
 */
export interface UnieaiGateSession {
  /** The product's own account id. */
  userId: string
  /** The desktop API key for `/api/desktop/*`. Never leaves this process. */
  apiKey: string
}

/**
 * The gate's host-side seam: who is signed in, and what the product will tell
 * this host on their behalf.
 *
 * It exists because the gate's session table is the only place on this host
 * that holds a product credential, and two host plugins need what that
 * credential buys — the MCP supervisor mounts the servers it grants, and the
 * cloud LLM route sends turns through the product's relay with it. Both read
 * through here rather than being handed the table.
 *
 * The two read methods are the same proxied reads `/auth/mcp` and
 * `/auth/models` serve, minus the browser projection: a host consumer needs
 * the endpoint and the bearer that a page must never see.
 */
export interface UnieaiGate {
  /** The web product's origin, without a trailing slash. */
  readonly productUrl: string
  /**
   * The account currently signed in, or undefined when none is.
   *
   * Sessions expire on idleness, and that expiry is evaluated when a session
   * is read rather than on a timer, so a caller that stops asking stops
   * observing the lapse. Callers that hold something on a session's behalf
   * therefore re-read on their own schedule instead of waiting to be told.
   * @returns the session, or undefined while signed out.
   */
  session(): UnieaiGateSession | undefined
  /**
   * The MCP servers the account may mount, each with its short-lived bearer.
   * @param signal - cancels the request.
   * @returns the grants, undefined when the product could not be read, or
   * undefined when nobody is signed in — a host consumer distinguishes the two
   * through {@link session}.
   */
  mcpServers(signal?: AbortSignal): Promise<McpServerGrant[] | undefined>
  /**
   * The models the account is entitled to run on the product — the same list
   * `/auth/models` serves.
   * @param signal - cancels the request.
   * @returns the models, or undefined when the list could not be read.
   */
  entitledModels(signal?: AbortSignal): Promise<EntitledModel[] | undefined>
  /**
   * One skill's `SKILL.md`, as the account keeps it on the product.
   *
   * A host consumer reads the document here rather than taking one from a
   * browser: the thing that writes a file onto this machine should be handed
   * an identifier and fetch the bytes itself, not be handed the bytes.
   * @param slug - the skill to read, as the listing reported it.
   * @param signal - cancels the request.
   * @returns the document, `not-found` when the account has no such skill,
   * `unreadable` when the product could not be read, and undefined while
   * nobody is signed in.
   */
  accountSkill(
    slug: string,
    signal?: AbortSignal,
  ): Promise<AccountSkillDocument | SkillDocumentFailure | undefined>
}

declare module '@unieai/cordis' {
  interface Context {
    unieaiGate: UnieaiGate
  }
  interface Events {
    /**
     * The signed-in account changed: a sign-in that produced a session, or the
     * loss of the last one to a sign-out. Carries the new state, so a listener
     * that mounts something per account does not have to ask again.
     *
     * NOT emitted when a session merely lapses on idleness — expiry is lazy,
     * evaluated on read, so nothing observes the moment it happens. A listener
     * holding a resource on the account's behalf must re-read on its own
     * schedule rather than treat this event as the only signal.
     * @param session - the account now signed in, or undefined for none.
     * @mode emit
     */
    'unieai-gate/session'(session: UnieaiGateSession | undefined): void
  }
}

/** Plugin name for the Loader. */
export const name = 'unieai-web-gate'
/** Required service: the HTTP carrier this gate guards and serves routes on. */
export const inject = ['webServer']

/** Deployment configuration. */
export interface Config {
  /** Origin of the UnieAI Copilot web product this desktop signs in against. */
  productUrl: string
  /**
   * Whether the guard actually refuses traffic. Off by default so a
   * composition can mount the gate, exercise the sign-in flow at
   * `/auth/login`, and only then commit to it — turning a half-verified fence
   * on by default would lock an operator out of a working machine.
   */
  enforce: boolean
  /**
   * Accounts allowed in. Empty plus `claimFirstLogin` means the first account
   * to complete a sign-in becomes the owner and the only one admitted.
   */
  allowedUserIds: string[]
  /** Whether an empty allowlist is claimed by the first successful sign-in. */
  claimFirstLogin: boolean
  /** Idle lifetime of a browser session, in milliseconds. */
  idleTimeoutMs: number
  /**
   * Admit requests that did not arrive through a reverse proxy.
   *
   * A proxy announces itself with `X-Forwarded-For`; a request without one
   * reached the listen socket directly, which on a desktop deployment means
   * the operator on this machine. Keeping that path open lets the fence be
   * enforced on the public host without locking the operator out of the local
   * port while sign-in is still being brought up.
   *
   * What it does NOT do: it is not a loopback check. Anything that can reach
   * the socket without adding the header is admitted, which includes other
   * containers when the port is published to a bridge. Turn it off for a
   * deployment where that set is not trusted.
   */
  allowDirectRequests: boolean
}

/** Schema for {@link Config}. */
export const Config: z<Config> = z.object({
  productUrl: z.string().default('https://agent.unieai.com'),
  enforce: z.boolean().default(false),
  allowedUserIds: z.array(z.string()).default([]),
  claimFirstLogin: z.boolean().default(true),
  idleTimeoutMs: z.natural().default(12 * 60 * 60 * 1000),
  allowDirectRequests: z.boolean().default(true),
})

const COOKIE = 'dsh_session'

/**
 * Paths served before a session exists. Everything else — the application
 * shell, the plugin registry, `/api`, and the downlinks — is behind the fence.
 */
const PUBLIC_PREFIXES = ['/auth', '/favicon.ico', '/favicon.svg', '/icons/', '/manifest.webmanifest']

/** A signed-in browser. The cookie itself is never stored, only its digest. */
interface GateSession extends DeviceSession {
  lastSeenAt: number
}

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Read one cookie from a request's Cookie header. */
function readCookie(req: IncomingMessage, key: string): string | undefined {
  const header = req.headers.cookie
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === key) return rest.join('=')
  }
  return undefined
}

/** Whether the request reached us over TLS, honouring the proxy's header. */
const isSecure = (req: IncomingMessage): boolean =>
  String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim() === 'https'

/** Whether this is a top-level navigation, which deserves a redirect not a 401. */
function isNavigation(req: IncomingMessage): boolean {
  if (req.headers['sec-fetch-mode'] === 'navigate') return true
  return (req.headers.accept ?? '').includes('text/html')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}

/** A login body is a device code; anything larger is not one. */
const LOGIN_BODY_LIMIT = 8192

/**
 * Buffering bound for a profile save, whose body carries an avatar inline as a
 * base64 data URL. This is a transport limit of the host's own — the product
 * bounds no avatar size, and neither does its browser form — so it is set well
 * above what the editor produces (a 512px square PNG, under a megabyte) and
 * exists only so an unbounded upload cannot be buffered into this process.
 */
const PROFILE_BODY_LIMIT = 12 * 1024 * 1024

/**
 * English by construction, like `/auth/account`'s failure line: this host does
 * not know the reader's language, so the browser half substitutes its own
 * localized text and these strings stay diagnostics for a direct caller.
 */
const PROFILE_UNREADABLE = 'The UnieAI profile could not be read.'
/** Companion of {@link PROFILE_UNREADABLE} for a rejected or lost write. */
const PROFILE_NOT_SAVED = 'The UnieAI profile could not be saved.'

/**
 * Buffering bound for a provider create. The body is four short strings — a
 * name, a four-character prefix, an endpoint and a credential — so this is
 * generous by an order of magnitude and exists only so an unbounded upload
 * cannot be buffered into this process.
 */
const PROVIDER_BODY_LIMIT = 64 * 1024

/**
 * Buffering bound for an invite send. The body is one email address, so this
 * is generous by orders of magnitude and exists only so an unbounded upload
 * cannot be buffered into this process.
 */
const INVITE_BODY_LIMIT = 8192

/** Diagnostics for a direct caller, in the same English-by-construction sense. */
const PROVIDERS_UNREADABLE = 'The UnieAI providers could not be read.'
/** Companion of {@link PROVIDERS_UNREADABLE} for the entitled-model list. */
const MODELS_UNREADABLE = 'The UnieAI models could not be read.'
/** Companion of {@link PROVIDERS_UNREADABLE} for a create that reached no verdict. */
const PROVIDER_NOT_CREATED = 'The UnieAI provider could not be created.'
/** Companion of {@link PROVIDERS_UNREADABLE} for an edit that reached no verdict. */
const PROVIDER_NOT_UPDATED = 'The UnieAI provider could not be updated.'
/** Companion of {@link PROVIDERS_UNREADABLE} for a delete that reached no verdict. */
const PROVIDER_NOT_DELETED = 'The UnieAI provider could not be deleted.'
/** Companion of {@link PROVIDERS_UNREADABLE} for the activity statistics. */
const STATS_UNREADABLE = 'The UnieAI activity statistics could not be read.'
/** Companion of {@link PROVIDERS_UNREADABLE} for the mountable MCP servers. */
const MCP_UNREADABLE = 'The UnieAI MCP servers could not be read.'
const SKILLS_UNREADABLE = 'The skills on your UnieAI account could not be read.'
const SKILL_GONE = 'That skill is no longer on your UnieAI account.'
/**
 * Companion of {@link PROVIDERS_UNREADABLE} for the account snapshot. English
 * by construction like the others: the browser half substitutes its own
 * localized line and this stays a diagnostic for a direct caller.
 */
const ACCOUNT_UNREADABLE = 'The UnieAI account could not be read.'

/**
 * How long `/auth/bootstrap` waits for a cold gather before answering with
 * whatever has landed.
 *
 * It is a bound on the desktop's own startup, not on the product: the browser
 * blocks its first frame on this answer, so the number is what a person is
 * willing to look at a boot screen for when the product is slow, and the parts
 * that miss it keep gathering into the warm-up for the read that follows.
 */
const BOOTSTRAP_DEADLINE_MS = 2000

/**
 * How long one completed gather is answered from memory.
 *
 * The window this covers is a single navigation — the sign-in page hands the
 * browser to the application, which asks immediately — so it is short enough
 * that nothing else can plausibly read it, and long enough that a reload a few
 * seconds later still lands warm.
 */
const BOOTSTRAP_CACHE_TTL_MS = 30 * 1000

/**
 * Ceiling on one gather's product reads. Well above the answer deadline on
 * purpose: a part that misses the deadline is still worth having a moment
 * later, and this exists only so a socket that never answers is not held open
 * on the account's behalf forever.
 */
const BOOTSTRAP_UPSTREAM_TIMEOUT_MS = 15 * 1000

async function readJsonBody(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

/**
 * Narrow one browser-supplied profile save into the product's patch shape.
 *
 * Nothing is validated beyond the field types the wire needs, and that is
 * deliberate: the product owns what a legal name and a legal avatar are, so a
 * second copy of those rules here could only disagree with it. The one thing
 * this reader must get right is the three-way `image` intent — a data URL
 * sets, `null` clears, absent leaves alone — because collapsing absent into
 * null would delete an avatar on a name-only save.
 * @param body - the parsed request body.
 * @returns the patch, or undefined when the body names no display name.
 */
function readProfilePatch(body: Record<string, unknown>): ProfilePatch | undefined {
  const name = body['name']
  if (typeof name !== 'string') return undefined
  const image = body['image']
  if (image === undefined) return { name }
  const mimeType = body['imageMimeType']
  const extension = body['imageExtension']
  return {
    name,
    image: typeof image === 'string' ? image : null,
    imageMimeType: typeof mimeType === 'string' ? mimeType : null,
    imageExtension: typeof extension === 'string' ? extension : null,
  }
}

/**
 * Mount the gate: the `/auth` routes, and the guard when enforcement is on.
 * @param ctx - Cordis context carrying `webServer`.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const productUrl = config.productUrl.replace(/\/+$/, '')
  const sessions = new Map<string, GateSession>()
  let ownerUserId: string | undefined = config.allowedUserIds[0]

  const admitsUser = (userId: string): boolean => {
    if (config.allowedUserIds.length > 0) return config.allowedUserIds.includes(userId)
    if (!config.claimFirstLogin) return false
    if (ownerUserId === undefined) { ownerUserId = userId; return true }
    return ownerUserId === userId
  }

  /**
   * Release a claim the first sign-in took, once nobody is signed in.
   *
   * A claim exists so a machine serves ONE account, not so it serves one
   * account forever. Signing out is a person saying they are done with this
   * machine, and leaving the claim standing after it meant the next sign-in —
   * theirs, on another account — was refused with "already claimed by another
   * account", which names a stranger for what was in fact their own previous
   * session. Nothing in the product could clear it; only restarting the Host
   * could, because the claim is a variable in this process.
   *
   * A CONFIGURED allowlist is not a claim and is never released: a deployment
   * that names its accounts means them, and no browser action should widen it.
   */
  const releaseClaim = (): void => {
    if (config.allowedUserIds.length > 0) return
    ownerUserId = undefined
  }

  const currentSession = (req: IncomingMessage): GateSession | undefined => {
    const presented = readCookie(req, COOKIE)
    if (presented === undefined) return undefined
    const key = digest(presented)
    const session = sessions.get(key)
    if (session === undefined) return undefined
    if (Date.now() - session.lastSeenAt > config.idleTimeoutMs) {
      sessions.delete(key)
      return undefined
    }
    session.lastSeenAt = Date.now()
    return session
  }

  /**
   * The account this host currently acts for, pruning sessions that have gone
   * idle on the way past. Any live session will do: the allowlist admits one
   * account, so every session in the table carries the same account's key, and
   * a second browser signing in must not displace what the first is running.
   * @returns the host-side session, or undefined while nobody is signed in.
   */
  const hostSession = (): UnieaiGateSession | undefined => {
    for (const [key, session] of sessions) {
      if (Date.now() - session.lastSeenAt > config.idleTimeoutMs) {
        sessions.delete(key)
        continue
      }
      return { userId: session.userId, apiKey: session.apiKey }
    }
    return undefined
  }

  // The last state announced, so a second browser signing in on the same
  // account — or a sign-out that leaves another session standing — does not
  // make every listener tear its work down and build it again.
  let announced: string | undefined
  /** Announce the host-side session when, and only when, it actually changed. */
  const announceSession = (): void => {
    const session = hostSession()
    const identity = session === undefined ? undefined : `${session.userId}\u0000${session.apiKey}`
    if (identity === announced) return
    announced = identity
    ctx.emit('unieai-gate/session', session)
  }

  ctx.provide('unieaiGate', {
    productUrl,
    session: hostSession,
    mcpServers: async (signal) => {
      const session = hostSession()
      return session === undefined ? undefined : fetchMcpServers(productUrl, session.apiKey, signal)
    },
    entitledModels: async (signal) => {
      const session = hostSession()
      return session === undefined ? undefined : fetchEntitledModels(productUrl, session.apiKey, signal)
    },
    accountSkill: async (slug, signal) => {
      const session = hostSession()
      return session === undefined ? undefined : fetchAccountSkill(productUrl, session.apiKey, slug, signal)
    },
  } satisfies UnieaiGate)

  // The four part readers. Each answers exactly the body its own `/auth/*`
  // route sends a signed-in browser, and each route below sends what it
  // returns — so the startup answer and the individual routes cannot drift
  // into two descriptions of the same thing.
  const accountBody = async (apiKey: string, signal?: AbortSignal): Promise<unknown> => {
    const snapshot = await fetchAccountSnapshot(productUrl, apiKey, signal)
    return snapshot === undefined
      ? { status: 'failed', message: ACCOUNT_UNREADABLE }
      : { status: 'signed-in', snapshot }
  }
  const providersBody = async (apiKey: string, signal?: AbortSignal): Promise<unknown> => {
    const providers = await fetchProviders(productUrl, apiKey, signal)
    return providers === undefined
      ? { status: 'failed', message: PROVIDERS_UNREADABLE }
      : { status: 'signed-in', providers }
  }
  const modelsBody = async (apiKey: string, signal?: AbortSignal): Promise<unknown> => {
    const models = await fetchEntitledModels(productUrl, apiKey, signal)
    return models === undefined
      ? { status: 'failed', message: MODELS_UNREADABLE }
      : { status: 'signed-in', models }
  }
  const mcpBody = async (apiKey: string, signal?: AbortSignal): Promise<unknown> => {
    const servers = await fetchMcpServers(productUrl, apiKey, signal)
    return servers === undefined
      ? { status: 'failed', message: MCP_UNREADABLE }
      : { status: 'signed-in', servers: servers.map(toMcpServerView) }
  }

  // The startup warm-up. It gathers on this host because this host is where
  // the API key is, and it starts at the sign-in rather than at the first
  // request because that is the second the browser spends navigating.
  const warmup = new BootstrapWarmup({
    readers: { account: accountBody, providers: providersBody, models: modelsBody, mcp: mcpBody },
    ttlMs: BOOTSTRAP_CACHE_TTL_MS,
    upstreamTimeoutMs: BOOTSTRAP_UPSTREAM_TIMEOUT_MS,
  })
  ctx.effect(() => () => { warmup.dispose() }, 'unieai-web-gate: startup warm-up')

  ctx.effect(() => ctx.webServer.registerGuard((req, reply) => {
    if (!config.enforce) return true
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (PUBLIC_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))) return true
    if (config.allowDirectRequests && req.headers['x-forwarded-for'] === undefined) return true
    if (currentSession(req) !== undefined) return true
    if (reply.socket !== undefined) { reply.socket.destroy(); return false }
    const res = reply.res
    if (res === undefined) return false
    if (isNavigation(req)) {
      res.writeHead(302, { location: '/auth/login' })
      res.end()
    } else {
      json(res, 401, { error: 'unauthenticated' })
    }
    return false
  }), 'unieai-web-gate: request guard')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/login',
    handler: (req, res) => {
      // An admitted visitor has no business on the sign-in page.
      if (config.enforce && currentSession(req) !== undefined) {
        res.writeHead(302, { location: '/' })
        res.end()
        return
      }
      const body = renderLoginPage(productUrl)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body) })
      res.end(body)
    },
  }), 'unieai-web-gate: sign-in page')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/device/start',
    handler: async (_req, res) => {
      try {
        json(res, 200, await startDeviceLogin(productUrl))
      } catch (error) {
        json(res, 502, { message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'unieai-web-gate: device start')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/device/poll',
    handler: async (req, res) => {
      let deviceCode: string
      try {
        const body = await readJsonBody(req, LOGIN_BODY_LIMIT)
        deviceCode = typeof body['deviceCode'] === 'string' ? body['deviceCode'] : ''
      } catch (error) {
        json(res, 400, { status: 'error', message: error instanceof Error ? error.message : String(error) })
        return
      }
      if (deviceCode === '') {
        json(res, 400, { status: 'error', message: 'deviceCode required' })
        return
      }
      const outcome = await pollDeviceLogin(productUrl, deviceCode)
      if (outcome.status !== 'approved') {
        json(res, 200, outcome)
        return
      }
      if (!admitsUser(outcome.session.userId)) {
        json(res, 200, {
          status: 'error',
          message: 'This instance is already claimed by another account.',
        })
        return
      }
      const cookie = randomBytes(32).toString('base64url')
      sessions.set(digest(cookie), { ...outcome.session, lastSeenAt: Date.now() })
      // After the table holds the session, never before: a host plugin that
      // reacts by reading the product must find the credential already there.
      announceSession()
      // The browser is about to leave this page for the application. Start
      // gathering now, so the startup read it makes on arrival is answered
      // from memory instead of starting a fan-out of its own.
      warmup.warm({ userId: outcome.session.userId, apiKey: outcome.session.apiKey })
      const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${String(Math.floor(config.idleTimeoutMs / 1000))}`]
      if (isSecure(req)) attributes.push('Secure')
      res.setHeader('set-cookie', `${COOKIE}=${cookie}; ${attributes.join('; ')}`)
      json(res, 200, { status: 'approved' })
    },
  }), 'unieai-web-gate: device poll')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/session',
    handler: (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: config.enforce ? 'signed-out' : 'unavailable' })
        return
      }
      json(res, 200, {
        status: 'signed-in',
        user: { id: session.userId, name: session.displayName, email: session.email },
      })
    },
  }), 'unieai-web-gate: session probe')

  // The startup answer: everything a freshly loaded desktop needs about its
  // account, in one body, so the application does not open onto surfaces that
  // each fetch their own corner of it.
  //
  // Signed out costs nothing at all — no product call, no waiting — because a
  // desktop with no session has nothing to gather and the local agent works
  // without one. Signed in answers from the warm-up, which usually completed
  // during the navigation out of the sign-in page; a cold start waits, but
  // only until {@link BOOTSTRAP_DEADLINE_MS}, and names the parts that did not
  // make it rather than pretending they are absent.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/bootstrap',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out', parts: {}, pending: [] })
        return
      }
      const gathered = await warmup.read(
        { userId: session.userId, apiKey: session.apiKey },
        BOOTSTRAP_DEADLINE_MS,
      )
      json(res, 200, gathered)
    },
  }), 'unieai-web-gate: startup answer')

  // The account snapshot the settings surface draws. It exists as a host route
  // because the session's API key must not reach a page: the browser asks this
  // host, the host asks the product, and only the product's answer — which
  // carries no credential — is written back.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/account',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      // Deliberately not the warm-up's copy. This route is the refresh path —
      // a page reads it again after a save, or to retry a failure — and a
      // refresh that answered from a cache would report the state the reader
      // is trying to move past.
      json(res, 200, await accountBody(session.apiKey))
    },
  }), 'unieai-web-gate: account snapshot')

  /** Apply one profile save on behalf of a signed-in browser. */
  const saveProfile = async (
    req: IncomingMessage,
    res: ServerResponse,
    session: GateSession,
  ): Promise<void> => {
    let patch: ProfilePatch | undefined
    try {
      patch = readProfilePatch(await readJsonBody(req, PROFILE_BODY_LIMIT))
    } catch (error) {
      json(res, 400, { status: 'failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    if (patch === undefined) {
      // The gate's own shape check, reported as the product's own refusal for
      // the same condition: the page has one line for "the name is missing",
      // and which side noticed is not something a reader needs to know.
      json(res, 400, { status: 'failed', reason: 'name-required', message: PROFILE_NOT_SAVED })
      return
    }
    const outcome = await updateAccountProfile(productUrl, session.apiKey, patch)
    if (outcome.status === 'refused') {
      // The identifier travels, the prose does not. The product rejects with an
      // English sentence written for a direct caller, and only the browser
      // knows the reader's language — so the page is told WHICH refusal
      // happened and says it in words. `message` rides along unread, for a
      // direct caller of this route.
      json(res, 200, { status: 'failed', reason: outcome.reason, message: PROFILE_NOT_SAVED })
      return
    }
    if (outcome.status === 'failed') {
      json(res, 200, { status: 'failed', message: PROFILE_NOT_SAVED })
      return
    }
    json(res, 200, { status: 'saved', profile: outcome.profile })
  }

  // The profile the settings section edits. Same reason as `/auth/account`:
  // the write is authenticated by the session's API key, which stays on this
  // host. GET proxies the product's read; POST proxies its PATCH and answers
  // with the profile the product actually stored, so the page shows what was
  // saved rather than what it asked for.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/profile',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      if (req.method === 'POST') {
        await saveProfile(req, res, session)
        return
      }
      const profile = await fetchAccountProfile(productUrl, session.apiKey)
      if (profile === undefined) {
        json(res, 200, { status: 'failed', message: PROFILE_UNREADABLE })
        return
      }
      json(res, 200, { status: 'signed-in', profile })
    },
  }), 'unieai-web-gate: account profile')

  /** Forward one provider create on behalf of a signed-in browser. */
  const addProvider = async (
    req: IncomingMessage,
    res: ServerResponse,
    session: GateSession,
  ): Promise<void> => {
    let draft: ReturnType<typeof readProviderDraft>
    try {
      draft = readProviderDraft(await readJsonBody(req, PROVIDER_BODY_LIMIT))
    } catch (error) {
      json(res, 400, { status: 'failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    // Shape only. Which prefixes are free, how long a plan lets the list get,
    // and what an acceptable endpoint is are the product's rules; checking
    // them here as well is how the two would come to disagree.
    if (draft === undefined) {
      json(res, 400, { status: 'failed', message: 'prefix, apiUrl and apiKey are required' })
      return
    }
    const outcome = await createProvider(productUrl, session.apiKey, draft)
    if (outcome.status === 'failed') {
      json(res, 200, { status: 'failed', message: PROVIDER_NOT_CREATED })
      return
    }
    // A refusal travels as the product's own identifier, not as prose: only
    // the browser knows the reader's language, and it renders one line per
    // reason. The identifier is forwarded verbatim so a reason this build
    // does not recognise still arrives at a page that might.
    json(res, 200, outcome)
  }

  /** Forward one provider edit or removal on behalf of a signed-in browser. */
  const changeProvider = async (
    req: IncomingMessage,
    res: ServerResponse,
    session: GateSession,
    id: string,
  ): Promise<void> => {
    if (req.method === 'DELETE') {
      const outcome = await deleteProvider(productUrl, session.apiKey, id)
      json(res, 200, outcome.status === 'failed'
        ? { status: 'failed', message: PROVIDER_NOT_DELETED }
        : outcome)
      return
    }
    let patch: ReturnType<typeof readProviderPatch>
    try {
      patch = readProviderPatch(await readJsonBody(req, PROVIDER_BODY_LIMIT))
    } catch (error) {
      json(res, 400, { status: 'failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    // Shape only, and absence is the whole of it: a field this body does not
    // carry must not travel as an empty string, because that is the difference
    // between keeping the stored credential and erasing it. What a managed row
    // may change, and which prefixes are free, are the product's rules.
    if (patch === undefined) {
      json(res, 400, { status: 'failed', message: 'no provider field to change' })
      return
    }
    const outcome = await updateProvider(productUrl, session.apiKey, id, patch)
    // A refusal travels as the product's own identifier and its offending
    // field names, not as prose — `managed_provider_readonly` is the one the
    // owner's own Studio row answers with, and only the browser knows the
    // reader's language for it.
    json(res, 200, outcome.status === 'failed'
      ? { status: 'failed', message: PROVIDER_NOT_UPDATED }
      : outcome)
  }

  // The account's API Providers — the same rows the web product's "API
  // Provider Settings" page lists. Same seam as `/auth/account`: the session's
  // API key stays on this host, and the answer carries no credential of any
  // kind, for any provider. POST adds one; `/auth/providers/<id>` below edits
  // and removes one.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/providers',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      if (req.method === 'POST') {
        await addProvider(req, res, session)
        return
      }
      // Uncached, for the same reason as `/auth/account`: this is what a
      // section reads after adding a provider.
      json(res, 200, await providersBody(session.apiKey))
    },
  }), 'unieai-web-gate: account providers')

  // One provider by id: `PATCH /auth/providers/<id>` edits it, `DELETE`
  // removes it and every model it offered. A prefix route, because the id is
  // the product's own row id and belongs in the path; the exact table above is
  // consulted first, so the collection route keeps `/auth/providers` itself.
  //
  // Neither verb decides anything. A platform-managed row accepts only its
  // per-model selection and its enable flag, and cannot be deleted at all —
  // that rule lives in the product, beside the row, and this host forwards the
  // 409 it answers with rather than keeping a second copy that could drift.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/auth/providers',
    handler: async (req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      const tail = path.slice('/auth/providers/'.length)
      // One segment only: a deeper path is not a provider id, and answering it
      // would send an encoded slash to the product as part of a row id.
      if (tail === '' || tail.includes('/')) {
        json(res, 404, { status: 'failed', message: 'no such provider route' })
        return
      }
      if (req.method !== 'PATCH' && req.method !== 'DELETE') {
        json(res, 405, { status: 'failed', message: 'PATCH or DELETE only' })
        return
      }
      let id: string
      try {
        id = decodeURIComponent(tail)
      } catch {
        // `decodeURIComponent` throws only on a malformed escape, which no
        // product row id produces; there is nothing to address.
        json(res, 404, { status: 'failed', message: 'no such provider route' })
        return
      }
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      await changeProvider(req, res, session, id)
    },
  }), 'unieai-web-gate: one provider')

  // The models the account is entitled to run on the web product. Same seam as
  // `/auth/providers`: the session's API key stays on this host and the answer
  // carries no credential.
  //
  // Read-only, and a visibility surface rather than a model source. What makes
  // these entitlements runnable is the product's relay and the host route
  // `@unieai/uad-llm-unieai-cloud` builds over it; that plugin reads the
  // same list through `ctx.unieaiGate`, because a host plugin has no browser
  // cookie to present here.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/models',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      json(res, 200, await modelsBody(session.apiKey))
    },
  }), 'unieai-web-gate: entitled models')

  // Referral invites. POST only: the invites an account has already sent ride
  // on `/auth/account`, which the browser's account gateway is already reading
  // for the balance and the count, so a second list route would be a second
  // source for the same rows.
  //
  // A refusal travels as the product's own identifier (`invalid_email`,
  // `self_invite`, `already_invited`), forwarded verbatim so a reason this
  // build does not recognise still reaches a page that might.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/invite',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      let email: string | undefined
      try {
        email = readInviteEmail(await readJsonBody(req, INVITE_BODY_LIMIT))
      } catch (error) {
        json(res, 400, { status: 'failed', message: error instanceof Error ? error.message : String(error) })
        return
      }
      // Shape only. Which addresses are legal, and which one is the account's
      // own, are the product's rules; a second copy here is how the two would
      // come to disagree.
      if (email === undefined) {
        json(res, 400, { status: 'refused', reason: 'invalid_email' })
        return
      }
      json(res, 200, await sendInvite(productUrl, session.apiKey, email))
    },
  }), 'unieai-web-gate: referral invite')

  // The account's activity: the five Overview figures and the day series the
  // heatmap draws. Same seam as `/auth/account`, and the same record — that
  // snapshot carries this one under `activity`, so a surface drawing both
  // reads one endpoint, and a surface drawing only the heatmap reads this one.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/stats',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      const stats = await fetchDesktopStats(productUrl, session.apiKey)
      if (stats === undefined) {
        // Not a zeroed record: an account with no activity and a read that did
        // not happen must not render the same, because zeroes are a claim.
        json(res, 200, { status: 'failed', message: STATS_UNREADABLE })
        return
      }
      json(res, 200, { status: 'signed-in', stats })
    },
  }), 'unieai-web-gate: activity statistics')

  // The MCP servers the account may mount. This route answers a plugins page,
  // not a client: the product mints a bearer per server, that bearer stays in
  // this process, and what travels back is `McpServerView` — a type with no
  // `token` member at all, naming the endpoint's ORIGIN rather than the
  // endpoint. The host plugin that actually dials these servers reads the
  // grants through the `unieaiGate` service instead, never through here.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/mcp',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      // The product tells an account that has connected nothing apart from a
      // product that could not answer, and `mcpBody` keeps them apart: an
      // empty list is an answer, a failed read is a failure.
      json(res, 200, await mcpBody(session.apiKey))
    },
  }), 'unieai-web-gate: mountable MCP servers')

  // The skills the account keeps in the web product, for a person choosing
  // which to copy onto this machine. A listing only: what a copy actually
  // writes comes from the route below, one skill at a time, because an account
  // with fifty skills has fifty documents nobody asked for.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/skills',
    handler: async (req, res) => {
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      const answer = await fetchAccountSkills(productUrl, session.apiKey)
      // An account that has written none is an answer; a failed read is not —
      // and the failure says WHICH failure, because "could not be read" sends
      // a person to check four unrelated things.
      json(res, 200, answer.ok
        ? { status: 'signed-in', skills: answer.skills }
        : { status: 'failed', message: accountSkillsFailureMessage(answer.failure, productUrl) })
    },
  }), 'unieai-web-gate: account skills')

  // One skill's SKILL.md. A prefix route, because the slug is the product's
  // own identifier and belongs in the path; the exact table above is consulted
  // first, so the listing keeps `/auth/skills` itself.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/auth/skills',
    handler: async (req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      const tail = path.slice('/auth/skills/'.length)
      // One plain segment. The slug becomes a directory name on this machine,
      // so a deeper path — or one carrying a parent reference — is refused
      // here as well as at the product, because this side is where a path
      // eventually gets built out of it.
      if (!isPlainSegment(tail)) {
        json(res, 404, { status: 'failed', message: SKILL_GONE })
        return
      }
      const session = currentSession(req)
      if (session === undefined) {
        json(res, 200, { status: 'signed-out' })
        return
      }
      const answer = await fetchAccountSkill(productUrl, session.apiKey, tail)
      if (answer === 'not-found') {
        json(res, 404, { status: 'failed', message: SKILL_GONE })
        return
      }
      if (answer === 'unreadable') {
        json(res, 200, { status: 'failed', message: SKILLS_UNREADABLE })
        return
      }
      json(res, 200, { status: 'signed-in', skill: answer })
    },
  }), 'unieai-web-gate: one account skill')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/auth/logout',
    handler: (req, res) => {
      const presented = readCookie(req, COOKIE)
      if (presented !== undefined) sessions.delete(digest(presented))
      // Only the loss of the LAST session signs this host out; another browser
      // still holding one keeps whatever was mounted on the account's behalf —
      // and keeps the gathered parts, which describe the account rather than
      // the browser that asked for them.
      announceSession()
      if (hostSession() === undefined) {
        warmup.forget()
        // The same "last session" test the comment above draws: while another
        // browser is still signed in, the machine is still that account's.
        releaseClaim()
      }
      res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
      json(res, 200, { status: 'signed-out' })
    },
  }), 'unieai-web-gate: logout')

  ctx.effect(() => () => {
    sessions.clear()
    announced = undefined
  }, 'unieai-web-gate: session table')
}

/** Expose the session shape for a composition that reads it. */
export type { GateSession }
