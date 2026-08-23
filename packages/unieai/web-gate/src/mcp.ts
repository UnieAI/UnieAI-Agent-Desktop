/**
 * Reads the MCP servers the signed-in account may mount, and splits that
 * answer into the half a page may see and the half only this host may hold.
 *
 * The product mints a short-lived per-user bearer for each server
 * (`lib/desktop/mcp.ts`). That bearer is the whole reason this module has two
 * types instead of one:
 *
 * - {@link McpServerGrant} is what the product sent. It carries the token and
 *   the absolute endpoint, and it exists only inside this process, for the
 *   host plugin that dials the server.
 * - {@link McpServerView} is what a browser receives. It has **no `token`
 *   member at all**, and it names the endpoint's origin rather than the
 *   endpoint, the same way `lib/desktop/providers.ts` withholds `apiKey` as a
 *   type. A future edit that wanted to send the token would have to add the
 *   field first, which is a change a reviewer sees.
 *
 * The origin, not the URL, because a remote MCP endpoint routinely carries a
 * token in its path or query — the product's own reasoning for publishing an
 * account's MCP entries as origins only. A plugins page shows where a server
 * lives; it never needs the address a request is sent to.
 *
 * The token is also short-lived, which is a fact about mounting rather than
 * about display: {@link McpServerGrant.expiresAt} says when every call to that
 * server starts failing with no other signal, so whoever mounted it must
 * re-read this list before then. That timestamp travels to the browser too,
 * because a plugins page showing a server as connected after its grant lapsed
 * would be showing something that is no longer true.
 */

/** One server the product will let this account mount, bearer included. */
export interface McpServerGrant {
  /** Stable id; the mounted instances are keyed by this. */
  id: string
  /** Name for display. */
  label: string
  /** Absolute streamable-http endpoint. Host-side only. */
  url: string
  /** Bearer for this user. Host-side only, and short-lived — see {@link expiresAt}. */
  token: string
  /** ISO timestamp at which {@link token} stops working. */
  expiresAt: string
  /** Tool names this server exposes, so a caller can show them unmounted. */
  tools: string[]
}

/**
 * One server as a browser may see it. Deliberately has no `token` and no
 * `url`: neither is something a page needs in order to list what is mounted.
 */
export interface McpServerView {
  /** Stable id, matching the grant's. */
  id: string
  /** Name for display. */
  label: string
  /** Origin of the endpoint — scheme, host, and port, never a path or query. */
  origin: string
  /** ISO timestamp at which this account's grant for the server lapses. */
  expiresAt: string
  /** Tool names the server exposes. */
  tools: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/** Narrow a reported list of tool names, dropping anything that is not one. */
function readTools(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/**
 * Narrow one reported server.
 *
 * An entry with no id, no endpoint, or no token is dropped rather than kept:
 * each of the three is required to mount it, and a row that cannot be mounted
 * is not a server this account may mount. `expiresAt` is not among them — a
 * build of the product that reported none still handed out a working token,
 * and the caller treats an unreadable expiry as "re-read soon" rather than as
 * a reason to refuse the server.
 * @param value - a candidate server object.
 * @returns the grant, or undefined when the value is not one.
 */
export function readMcpServerGrant(value: unknown): McpServerGrant | undefined {
  if (!isRecord(value)) return undefined
  const id = readString(value['id'])
  const url = readString(value['url'])
  const token = readString(value['token'])
  if (id === '' || url === '' || token === '') return undefined
  const label = readString(value['label'])
  return {
    id,
    // A server with no label is still mountable under its id, which is a worse
    // name than a real one and a better one than a blank row.
    label: label === '' ? id : label,
    url,
    token,
    expiresAt: readString(value['expiresAt']),
    tools: readTools(value['tools']),
  }
}

/**
 * Project one grant onto the browser-facing view.
 *
 * Built field by field from {@link McpServerView}'s own members, so a field
 * added to the grant — another credential, a signed URL — has nowhere to land
 * here unless someone adds it to the view as well.
 * @param grant - the server as the product reported it.
 * @returns the view, carrying no bearer and no request address.
 */
export function toMcpServerView(grant: McpServerGrant): McpServerView {
  return {
    id: grant.id,
    label: grant.label,
    origin: originOf(grant.url),
    expiresAt: grant.expiresAt,
    tools: [...grant.tools],
  }
}

/**
 * The origin of one endpoint, or the empty string when it is not a URL this
 * runtime can parse. Empty rather than the raw value: falling back to the
 * whole string is exactly the disclosure this projection exists to prevent.
 * @param url - the absolute endpoint from a grant.
 * @returns the origin, or an empty string.
 */
function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/**
 * Read the MCP servers this account may mount.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the grants, or undefined when the list could not be read — which
 * the caller reports as a failure rather than as an account with no servers.
 * The product draws that distinction itself: an account that has connected
 * nothing gets an empty list, and only a real failure gets a 502.
 */
export async function fetchMcpServers(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<McpServerGrant[] | undefined> {
  const response = await fetch(`${baseUrl}/api/desktop/mcp`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body) || !Array.isArray(body['servers'])) return undefined
  const servers: McpServerGrant[] = []
  const seen = new Set<string>()
  for (const entry of body['servers']) {
    const grant = readMcpServerGrant(entry)
    // Two grants under one id would mount twice under one namespace, which the
    // MCP client refuses at load; dropping the duplicate here keeps a
    // misbehaving product build from taking the whole set down with it.
    if (grant === undefined || seen.has(grant.id)) continue
    seen.add(grant.id)
    servers.push(grant)
  }
  return servers
}
