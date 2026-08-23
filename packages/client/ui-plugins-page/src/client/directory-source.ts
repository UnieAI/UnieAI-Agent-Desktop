/**
 * The plugin directory this page renders, read and written through the
 * sign-in gate's `/auth/plugins` routes.
 *
 * The catalogue is the web product's, not this build's. That is the whole
 * point of reading it over the wire rather than shipping a list: a plugin
 * added to the product appears here on the next read, with no desktop release
 * involved. This object holds no copy — it mirrors what the host last
 * reported and re-reads after every write, so a row shown here and a row shown
 * on the product's own Plugins page are the same row.
 *
 * It is deliberately separate from the cordis registry the Loader reports.
 * Those are this build's own modules — `include`, `typert-registry` — and a
 * reader cannot install, remove or choose them. Putting both in one list was
 * the mistake this source exists to undo: one of them is a product catalogue
 * and the other is a deployment's parts bill, and only the first is a
 * directory.
 *
 * `unsupported` is a first-class answer, not an error. A deployment whose
 * product predates the route serves a 404 and will keep serving one however
 * many times it is asked, so the page must say "this build cannot show you a
 * directory" rather than offer a Retry that cannot work. That distinction is
 * the same one {@link StudioMcpSource} draws, for the same reason.
 */

/** One plugin as the directory shows it. */
export interface DirectoryRow {
  /** The product's marketplace identifier; the identity it has on both sides. */
  slug: string
  /** Display name. */
  name: string
  /** One line, already localised by the product to the reader's locale. */
  description: string
  /**
   * The manifest's own grouping key, or empty when it declares none.
   *
   * Empty is carried rather than replaced with a bucket name: which heading an
   * ungrouped plugin files under is this page's presentation decision, and a
   * source that pre-decided it would make an ungrouped plugin indistinguishable
   * from one the product really did file under "other".
   */
  category: string
  /** Who publishes it; empty when the manifest names nobody. */
  author: string
  /** Absolute URL of the publisher's mark, or null when none is stored. */
  iconUrl: string | null
  /** How many skills the plugin bundles; 0 is a real answer. */
  skillCount: number
  /** Example prompts the publisher suggests. Empty when it suggests none. */
  tryAsking: readonly string[]
  /** Whether this account has it installed. */
  installed: boolean
  /** Whether an installed plugin is active. False when not installed. */
  enabled: boolean
}

/** What the page knows about the directory right now. */
export type DirectoryState =
  /** The first read has not settled yet. */
  | { status: 'loading' }
  /** This deployment's product serves no directory route at all. */
  | { status: 'unsupported' }
  /** The host holds no session, so there is no account to read a directory for. */
  | { status: 'signed-out' }
  /** A session exists and the catalogue could not be read. */
  | { status: 'failed' }
  /**
   * The catalogue as the product last reported it; empty is a real answer.
   *
   * `canInstall` is the account's plan verdict, reported separately from the
   * rows because it is a property of the reader, not of any plugin: a free
   * account sees the whole catalogue and may install none of it.
   */
  | { status: 'ready'; plugins: readonly DirectoryRow[]; canInstall: boolean }

/** What one install or removal established. */
export type DirectoryOutcome =
  | { ok: true }
  /** `reason` is a dictionary key, chosen from the product's own identifier. */
  | { ok: false; reason: DirectoryFailure }

/** The refusal lines this page can show. */
export type DirectoryFailure =
  | 'error.plan'
  | 'error.policy'
  | 'error.notFound'
  | 'error.failed'

/** Route the browser reads the catalogue through. */
const DIRECTORY_PATH = '/auth/plugins'

/** Route the browser installs and removes through. */
const INSTALL_PATH = '/auth/plugins/install'

/**
 * The browser facilities this source uses, named so a test can drive them.
 * Production values come from the plugin body; the paths are not configurable,
 * because they belong to the gate's own route table.
 */
export interface DirectoryEnvironment {
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

const readBoolean = (value: unknown): boolean => value === true

/**
 * Read a stored image URL, treating the empty string as absent.
 *
 * The product stores these columns `NOT NULL DEFAULT ''`, so "no icon" arrives
 * as an empty string rather than as null. Carrying that through as a URL would
 * put `<img src="">` in the page, which browsers resolve against the document
 * and fetch — the page would request itself once per iconless plugin.
 * @param value - the reported field.
 * @returns the URL, or null when the publisher stored none.
 */
function readImageUrl(value: unknown): string | null {
  const url = readString(value).trim()
  return url === '' ? null : url
}

/**
 * Read one catalogue entry, field by field from a fixed allowlist.
 *
 * An entry without a slug names nothing this page can act on — install, remove
 * and the reader's own memory of what they added are all keyed on it — so such
 * an entry is dropped rather than rendered as a row whose controls cannot work.
 * @param value - a candidate entry.
 * @returns the row, or undefined when the entry names no plugin.
 */
function readRow(value: unknown): DirectoryRow | undefined {
  if (!isRecord(value)) return undefined
  const slug = readString(value['slug']).trim()
  if (slug === '') return undefined
  const installed = readBoolean(value['installed'])
  const asking = Array.isArray(value['tryAsking'])
    ? value['tryAsking'].map(readString).filter(prompt => prompt !== '')
    : []
  const count = value['skillCount']
  return {
    slug,
    // A nameless plugin still lists, under its slug: the reader can act on it,
    // and hiding it would make an install they already have unremovable here.
    name: readString(value['name']).trim() || slug,
    description: readString(value['description']).trim(),
    category: readString(value['category']).trim(),
    author: readString(value['author']).trim(),
    iconUrl: readImageUrl(value['iconUrl']),
    skillCount: typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    tryAsking: asking,
    installed,
    // Enabled is meaningless for something not installed, and a host that sent
    // it anyway must not make the page draw an "active" mark on a row whose
    // control still says install.
    enabled: installed && readBoolean(value['enabled']),
  }
}

/**
 * Read the catalogue envelope.
 * @param body - the parsed response body.
 * @returns the ready state, or undefined when the body is not one.
 */
export function readDirectoryResponse(body: unknown): DirectoryState | undefined {
  if (!isRecord(body)) return undefined
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  const list = body['plugins']
  if (!Array.isArray(list)) return undefined
  const plugins: DirectoryRow[] = []
  for (const entry of list) {
    const row = readRow(entry)
    if (row !== undefined) plugins.push(row)
  }
  return { status: 'ready', plugins, canInstall: readBoolean(body['canInstall']) }
}

/**
 * Map the product's refusal identifier onto a line this page can show.
 * @param body - the parsed error body, if there was one.
 * @param status - the response status.
 * @returns the dictionary key to render.
 */
function readFailure(body: unknown, status: number): DirectoryFailure {
  const code = isRecord(body) ? readString(body['error']) : ''
  if (code === 'plugins_not_in_plan') return 'error.plan'
  if (code === 'plugin_policy_denied' || code === 'plugin_blocked') return 'error.policy'
  if (status === 404) return 'error.notFound'
  return 'error.failed'
}

/**
 * Compare two states cheaply enough to run on every read.
 *
 * The rows are compared by the fields a reader can see change, not by identity:
 * a re-read that reports the same catalogue must not publish, because every
 * publish re-renders a list whose rows carry images.
 * @param state - a state to key.
 * @returns a string equal for equal states.
 */
function stateKey(state: DirectoryState): string {
  if (state.status !== 'ready') return state.status
  return `ready:${String(state.canInstall)}:${state.plugins
    .map(row => `${row.slug}/${String(row.installed)}/${String(row.enabled)}`)
    .join(',')}`
}

/**
 * The catalogue, as this page reads and writes it.
 *
 * The object caches its state so repeated reads keep one reference between
 * changes — the uSES contract the render machinery relies on.
 */
export class DirectorySource {
  private state: DirectoryState = { status: 'loading' }

  private readonly listeners = new Set<() => void>()

  private disposed = false

  /**
   * @param environment - the browser facilities to read through.
   */
  constructor(private readonly environment: DirectoryEnvironment) {}

  /**
   * The last published reading.
   *
   * Named for the uSES contract the render machinery binds against
   * (`HostObservable`), which is also why the value is cached rather than
   * rebuilt: a snapshot that returned a fresh object each call would re-render
   * on every check.
   * @returns the current state.
   */
  getSnapshot(): DirectoryState {
    return this.state
  }

  /**
   * Subscribe to state changes.
   * @param listener - called after each change.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read `/auth/plugins` once and publish what it says.
   *
   * The status line decides the three answers that carry no catalogue. A 404
   * is `unsupported` rather than `failed`, because a product older than the
   * route will not start serving it on a retry — that is the state this build
   * stands in until the web product ships its side. A 401 is `signed-out`.
   * Everything else that is not `ok` is `failed`, the one a retry can fix.
   * @returns a promise settling when the reading has been published.
   */
  async refresh(): Promise<void> {
    const response = await this.environment.request(DIRECTORY_PATH).catch(() => undefined)
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
    this.adopt(readDirectoryResponse(body) ?? { status: 'failed' })
  }

  /**
   * Install one plugin for this account, then re-read.
   *
   * The re-read is what moves the row's control, rather than a local flip: the
   * product decides what "installed" means — which version was bound, whether
   * a policy downgraded the request — and a page that assumed success would
   * show a tick the account does not actually have.
   * @param slug - the plugin to install.
   * @returns what the attempt established.
   */
  async install(slug: string): Promise<DirectoryOutcome> {
    return this.write('POST', slug)
  }

  /**
   * Remove one plugin from this account, then re-read.
   * @param slug - the plugin to remove.
   * @returns what the attempt established.
   */
  async remove(slug: string): Promise<DirectoryOutcome> {
    return this.write('DELETE', slug)
  }

  /**
   * Send one write and re-read the catalogue behind it.
   * @param method - the verb the gate route distinguishes on.
   * @param slug - the plugin to act on.
   * @returns what the attempt established.
   */
  private async write(method: 'POST' | 'DELETE', slug: string): Promise<DirectoryOutcome> {
    const response = await this.environment.request(INSTALL_PATH, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug }),
    }).catch(() => undefined)
    if (response === undefined) return { ok: false, reason: 'error.failed' }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as unknown
      return { ok: false, reason: readFailure(body, response.status) }
    }
    // A write that landed and a re-read that failed are different things, and
    // the caller is told the write succeeded either way: the row is stale, not
    // the account. The next refresh corrects it.
    await this.refresh()
    return { ok: true }
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
  private adopt(next: DirectoryState): void {
    if (this.disposed) return
    if (stateKey(next) === stateKey(this.state)) return
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
