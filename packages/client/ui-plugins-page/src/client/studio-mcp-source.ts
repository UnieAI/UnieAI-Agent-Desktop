/**
 * The Studio MCP server list this page renders, read from the sign-in gate's
 * `GET /auth/mcp` route, which forwards the product's `GET /api/desktop/mcp`.
 *
 * READ-ONLY, AND DELIBERATELY SO. This page lists an account's MCP servers; it
 * does not add, edit, remove, or dial one. The state union below has no member
 * for a connected server and nothing here writes, because the browser is given
 * nothing to connect with: the answer carries a server's ORIGIN and never its
 * endpoint or its credential. The bearer that reaches the product stays on the
 * host, in the gate's session table, and that is the whole reason this file
 * exists rather than a `fetch` in a component.
 *
 * WHAT THE ANSWER DOES NOT CONTAIN, AND MUST NOT. There is no `token` and no
 * `url` on the wire and no member for either on {@link StudioMcpRow}. The wire
 * also carries `expiresAt`, describing how long the host's own token stays
 * good, and this file drops it on the floor: it is a fact about a credential
 * the browser never holds, and there is no gesture on this page that knowing
 * it would enable — a countdown or a refresh button built on it would be
 * decoration over someone else's clock. {@link readStudioMcpRow} builds each
 * row field by field from an allowlist, so a field a future host starts
 * sending — `expiresAt` included — reaches neither the state nor the DOM until
 * someone edits this type and reads this paragraph. The same holds one level
 * down: a catalogue entry is read into {@link StudioMcpTool}'s two fields by
 * name, so a per-tool credential would be dropped the same way a per-server
 * one is.
 *
 * FOUR ANSWERS THAT MUST STAY FOUR. A 404 is `unsupported`: a deployment older
 * than the route serves no MCP surface at all, and telling that reader a read
 * failed would suggest retrying is worth something. A 5xx or an unreachable
 * host is `failed`, which a retry can genuinely fix. No session is
 * `signed-out`. And `{servers: []}` is `ready` with nothing in it — a real
 * answer about a real account. An empty list that actually means "we never
 * asked" is the failure mode this page exists to avoid.
 *
 * The object caches its state so repeated reads keep one reference between
 * changes — the uSES contract the render machinery relies on.
 */

/**
 * One tool in a server's catalogue, as this page shows it.
 *
 * The name is the identifier the tool is called by, and it is the only half
 * the wire carries today: `/api/desktop/mcp` builds its `tools` from
 * `STUDIO_MCP_TOOLS.map(tool => tool.name)`, and the gate's `McpServerView`
 * types the field as `string[]`. The product HAS a sentence for each tool —
 * `lib/studio/mcp-tools.ts` writes one on every entry — and it is dropped at
 * that `.map`.
 *
 * {@link description} is therefore read but not yet supplied, and it is empty
 * on every row this build can actually receive. It exists because the page
 * draws a card per tool, and a card whose whole content is one identifier is
 * a box around a word: the sentence is the reason the shape is worth drawing,
 * and the page must be ready to draw it the moment the two host hops forward
 * it rather than a release later. A tool with no sentence draws its name and
 * nothing else — never a placeholder, and never a sentence invented here.
 */
export interface StudioMcpTool {
  /** The name the server calls it; an identifier a reader may need to type. */
  name: string
  /** What it does, in the host's own words; empty when none was reported. */
  description: string
}

/**
 * One MCP server as this page shows it.
 *
 * Every field is something a reader can act on by going to Studio. There is
 * deliberately no `url` and no `headers` member: not because the current host
 * omits them, but so that a future host cannot start sending them without
 * someone editing this type and reading the module doc above.
 */
export interface StudioMcpRow {
  /** The product's own row id; the identity this server has on both sides. */
  id: string
  /** The label the account gave it; empty when it gave none. */
  label: string
  /** Scheme and host of the server, without path, query, or any token in them. */
  origin: string
  /** The tools its catalogue reports; empty when it reported none. */
  tools: readonly StudioMcpTool[]
}

/** What this page knows about the account's MCP servers right now. */
export type StudioMcpState =
  /** The first read has not settled yet. */
  | { status: 'loading' }
  /** This deployment serves no MCP route at all (see module doc). */
  | { status: 'unsupported' }
  /** The host holds no session, so there is no account to list servers for. */
  | { status: 'signed-out' }
  /** A session exists and the list could not be read. */
  | { status: 'failed' }
  /** The list as the product last reported it; empty is a real answer. */
  | { status: 'ready'; servers: readonly StudioMcpRow[] }

/** Route the browser reads MCP servers through, when a build serves one. */
const MCP_PATH = '/auth/mcp'

/**
 * The browser facilities this source uses, named so a test can drive them.
 * Production values come from the plugin body; the path is not configurable,
 * because it belongs to the gate's own route table.
 */
export interface StudioMcpEnvironment {
  /**
   * Issue one same-origin request to the host gate.
   * @param path - an absolute path on this origin.
   * @param init - request options.
   * @returns the response.
   */
  request: (path: string, init?: RequestInit) => Promise<Response>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/**
 * One reported tool, in either shape the wire may use.
 *
 * A bare string is what every build of the host sends today, and it stays
 * readable here forever: the page must not blank its catalogues on the release
 * before the host starts describing them. An object is read field by field
 * from the same allowlist the row uses, so a catalogue entry that arrived
 * carrying a per-tool credential would leave both fields behind.
 * @param value - a candidate catalogue entry.
 * @returns the tool, or undefined when the entry names nothing.
 */
function readTool(value: unknown): StudioMcpTool | undefined {
  if (typeof value === 'string') {
    return value === '' ? undefined : { name: value, description: '' }
  }
  if (!isRecord(value)) return undefined
  const name = readString(value['name'])
  if (name === '') return undefined
  return { name, description: readString(value['description']) }
}

/**
 * The tools of one reported catalogue.
 *
 * Anything that names nothing is dropped rather than rendered as a blank card,
 * and the order the product gave is kept: it is the order the same catalogue
 * reads in on Studio. A repeated name is one tool reported twice — MCP names a
 * server's tools uniquely — so the list is deduplicated by name here and the
 * page can key it by name.
 * @param value - a candidate catalogue array.
 * @returns the distinct tools, in the reported order.
 */
function readTools(value: unknown): readonly StudioMcpTool[] {
  if (!Array.isArray(value)) return []
  const tools: StudioMcpTool[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    const tool = readTool(entry)
    if (tool === undefined || seen.has(tool.name)) continue
    seen.add(tool.name)
    tools.push(tool)
  }
  return tools
}

/**
 * Narrow one reported server.
 *
 * A row with no id is dropped: it cannot be keyed in a list, and rendering it
 * would put a server on the page that no later answer could match. Every other
 * field is copied by name, which is what keeps a field nobody here has read —
 * a credential above all — out of the state and off the page.
 * @param value - a candidate server object.
 * @returns the row, or undefined when the value is not one.
 */
export function readStudioMcpRow(value: unknown): StudioMcpRow | undefined {
  if (!isRecord(value)) return undefined
  const id = readString(value['id'])
  if (id === '') return undefined
  return {
    id,
    label: readString(value['label']),
    origin: readString(value['origin']),
    tools: readTools(value['tools']),
  }
}

/**
 * Read one `/auth/mcp` body into a state.
 *
 * The listing is recognised by its `servers` array rather than by an envelope
 * tag, so the product's own `{servers: []}` and the gate's `{status:
 * 'signed-in', servers}` are the same answer here. The two account states the
 * gate reports in its envelope keep their tags, because neither carries a
 * list to recognise.
 * @param body - the parsed JSON body.
 * @returns the state it describes, or undefined when this build cannot read
 * it — which the caller reports as a failure rather than as an account with
 * no servers.
 */
export function readStudioMcpResponse(body: unknown): StudioMcpState | undefined {
  if (!isRecord(body)) return undefined
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  if (body['status'] === 'failed') return { status: 'failed' }
  if (!Array.isArray(body['servers'])) return undefined
  const servers: StudioMcpRow[] = []
  for (const entry of body['servers']) {
    const row = readStudioMcpRow(entry)
    if (row !== undefined) servers.push(row)
  }
  return { status: 'ready', servers }
}

/** The state a source stands in before its first read settles. */
const LOADING: StudioMcpState = Object.freeze({ status: 'loading' as const })

/** Everything one state says, as one comparable string. */
function stateKey(state: StudioMcpState): string {
  if (state.status !== 'ready') return state.status
  return state.servers.map(row => [
    row.id, row.label, row.origin,
    row.tools.map(tool => `${tool.name}\u0000${tool.description}`).join(','),
  ].join(' ')).join('\n')
}

/** Observable MCP server list. It reads; it has nothing to write. */
export class StudioMcpSource {
  private readonly listeners = new Set<() => void>()
  private state: StudioMcpState = LOADING
  private disposed = false

  /**
   * @param environment - the browser facilities to use.
   */
  constructor(private readonly environment: StudioMcpEnvironment) {}

  /**
   * Read the current state.
   * @returns the standing state; the same reference until the list moves.
   */
  getSnapshot(): StudioMcpState {
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
   * Read `/auth/mcp` once and publish what it says.
   *
   * The status line decides between the three answers that carry no list. A
   * 404 is `unsupported` rather than `failed`, because a deployment older than
   * the route will not start serving it on a retry. A 401 is `signed-out`,
   * for a host that forwards the product's refusal instead of answering the
   * gate's own signed-out envelope. Everything else that is not `ok` is
   * `failed`, which is the one of the three a retry can fix.
   * @returns a promise settling when the reading has been published.
   */
  async refresh(): Promise<void> {
    const response = await this.environment.request(MCP_PATH).catch(() => undefined)
    if (response === undefined) {
      this.adopt({ status: 'failed' })
      return
    }
    if (response.status === 404) {
      this.adopt({ status: 'unsupported' })
      return
    }
    if (response.status === 401) {
      this.adopt({ status: 'signed-out' })
      return
    }
    if (!response.ok) {
      this.adopt({ status: 'failed' })
      return
    }
    const body = await response.json().catch(() => undefined) as unknown
    this.adopt(readStudioMcpResponse(body) ?? { status: 'failed' })
  }

  /** Stop publishing; a read still in flight lands on a closed source. */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  /**
   * Adopt a state and publish it, if it moved anything.
   * @param next - the state to stand on.
   */
  private adopt(next: StudioMcpState): void {
    if (this.disposed) return
    if (stateKey(next) === stateKey(this.state)) return
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
