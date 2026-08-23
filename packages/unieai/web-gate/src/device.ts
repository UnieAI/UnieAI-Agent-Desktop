/**
 * Device-code login against the UnieAI Copilot web product (copilot-v2).
 *
 * The desktop never talks to the agent runtime directly — the runtime is an
 * internal service. It talks to the web product, which proxies the RFC 8628
 * grant and, on approval, also mints the API key the desktop needs for the
 * product's own `/api/desktop/*` surface.
 */

/** What a started login shows the human, and what the poller needs. */
export interface DeviceGrant {
  /** Opaque, single-use; the desktop's only claim while the login is pending. */
  deviceCode: string
  /** The short code the human types into the browser. */
  userCode: string
  /** Absolute URL of the approval page. */
  verificationUrl: string
  /** Seconds until the grant expires. */
  expiresIn: number
  /** Seconds the client must wait between polls. */
  interval: number
}

/**
 * The credential and identity a completed login yields.
 *
 * One credential, deliberately: an API key for the web product's
 * `/api/desktop/*` routes. This desktop is a personal application that runs
 * its own agent locally, and it asks the product only for identity, plan, and
 * model credentials. It never accepts work from it, so there is nothing here
 * that would let the product reach back into this machine.
 */
export interface DeviceSession {
  /** Bearer for the web product's `/api/desktop/*` routes. */
  apiKey: string
  userId: string
  displayName: string | null
  email: string
}

/** One poll's answer. `pending` carries the delay the server asked for. */
export type PollOutcome =
  | { status: 'pending'; retryAfterSeconds?: number }
  | { status: 'approved'; session: DeviceSession }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; message: string }

/**
 * The approval page the product serves for this grant.
 *
 * Not `/desktop/login`: that page approves through `llm-runtime`, which a
 * deployment may not run. This one completes the grant in the product's own
 * database, which is the half the desktop needs to sign in.
 */
const APPROVE_PATH = '/desktop/authorize'

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<{
  ok: boolean
  status: number
  data: Record<string, unknown>
}> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? null,
  })
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  return { ok: response.ok, status: response.status, data }
}

/**
 * Open a login. The returned `verificationUrl` is absolute so the page can
 * link straight to it.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param signal - cancels the request.
 * @returns the grant to show and to poll with.
 */
export async function startDeviceLogin(baseUrl: string, signal?: AbortSignal): Promise<DeviceGrant> {
  const { ok, status, data } = await postJson(`${baseUrl}/api/desktop/device/start`, {}, signal)
  const userCode = typeof data['user_code'] === 'string' ? data['user_code'] : ''
  const deviceCode = typeof data['device_code'] === 'string' ? data['device_code'] : ''
  if (!ok || userCode === '' || deviceCode === '') {
    const detail = typeof data['error'] === 'string' ? data['error'] : `HTTP ${String(status)}`
    throw new Error(`unieai-web-gate: could not start a login (${detail})`)
  }
  return {
    deviceCode,
    userCode,
    // The code rides in the URL so the human confirms it rather than
    // transcribes it; the page still shows it in an editable field.
    verificationUrl: `${baseUrl}${APPROVE_PATH}?code=${encodeURIComponent(userCode)}`,
    expiresIn: typeof data['expires_in'] === 'number' ? data['expires_in'] : 600,
    interval: typeof data['interval'] === 'number' ? data['interval'] : 3,
  }
}

/**
 * Poll once. The caller owns the loop and obeys `interval`, so the desktop and
 * the server never disagree about the rate.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param deviceCode - from {@link startDeviceLogin}.
 * @param signal - cancels the request.
 * @returns this poll's outcome.
 */
export async function pollDeviceLogin(
  baseUrl: string,
  deviceCode: string,
  signal?: AbortSignal,
): Promise<PollOutcome> {
  let answer
  try {
    answer = await postJson(`${baseUrl}/api/desktop/device/poll`, { device_code: deviceCode }, signal)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  const { data } = answer
  const status = typeof data['status'] === 'string' ? data['status'] : ''
  if (status === 'pending') {
    const retry = data['retryAfterSeconds']
    return typeof retry === 'number' ? { status: 'pending', retryAfterSeconds: retry } : { status: 'pending' }
  }
  if (status === 'expired') return { status: 'expired' }
  if (status === 'denied') return { status: 'denied' }
  if (status !== 'approved') {
    const detail = typeof data['error'] === 'string' ? data['error'] : `unexpected status "${status}"`
    return { status: 'error', message: detail }
  }
  const apiKey = typeof data['api_key'] === 'string' ? data['api_key'] : ''
  const user = (data['user'] ?? {}) as Record<string, unknown>
  const userId = typeof user['id'] === 'string' ? user['id'] : ''
  if (apiKey === '' || userId === '') {
    return { status: 'error', message: 'approval carried no usable credential' }
  }
  return {
    status: 'approved',
    session: {
      apiKey,
      userId,
      displayName: typeof user['name'] === 'string' ? user['name'] : null,
      email: typeof user['email'] === 'string' ? user['email'] : '',
    },
  }
}
