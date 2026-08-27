/**
 * The skills the signed-in UnieAI account keeps, and the copy gesture.
 *
 * Read from the gate's `GET /auth/skills`, which forwards the product's own
 * `GET /api/desktop/skills`. Same seam as the Studio MCP area: the API key
 * that authenticates the product lives in the gate's session table on the
 * host, so the browser asks the host and the host asks the product.
 *
 * WHAT A COPY IS. Installing sends a slug to the host and nothing else; the
 * host fetches the document from the account itself and writes it into the
 * harness's skills directory. The bytes never pass through this page, which is
 * what keeps a browser from choosing what lands in a skills directory. What
 * comes back is the file that was written and whether it replaced one.
 *
 * A copy is not a link: the file becomes this machine's, editing it here
 * changes nothing on the account, and copying again overwrites it. The row
 * says so once a copy has happened rather than in advance, because a warning
 * about a file nobody has yet is noise.
 */

/** One skill the account keeps, as this page shows it. */
export interface AccountSkillRow {
  /** Stable identifier; the directory a copy is written into. */
  slug: string
  /** The skill's own name. */
  name: string
  /** One-line routing description. */
  description: string
  /** The account's own skill, or a built-in it runs with. */
  origin: 'personal' | 'builtin'
  /** Auxiliary files it carries there, which a copy does not bring. */
  attachments: readonly string[]
}

/** What the destination knows about the account's skills. */
export type AccountSkillsState =
  /** Nothing asked yet. */
  | { status: 'idle' }
  /** A read is in flight. */
  | { status: 'loading' }
  /** This build serves no account gate at all. */
  | { status: 'unsupported' }
  /** No account is signed in. */
  | { status: 'signed-out' }
  /** The account could not be read. */
  | { status: 'failed'; message: string }
  /** The account's skills; empty is a real answer. */
  | { status: 'ready'; skills: readonly AccountSkillRow[] }

/** Route the browser reads account skills through. */
const SKILLS_PATH = '/auth/skills'

/** The browser facilities this source uses, named so a test can drive them. */
export interface AccountSkillsEnvironment {
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
 * Narrow one reported skill.
 *
 * Built field by field rather than by spreading the wire object, so a field
 * the host starts sending reaches neither this state nor the DOM until someone
 * adds it to {@link AccountSkillRow} and reads this comment. A row with no
 * slug or no name is dropped: the slug is what a copy is asked for by, and the
 * name is what a person recognises.
 * @param value - a candidate row.
 * @returns the row, or undefined when the value is not one.
 */
export function readAccountSkillRow(value: unknown): AccountSkillRow | undefined {
  if (!isRecord(value)) return undefined
  const slug = readString(value['slug'])
  const name = readString(value['name'])
  if (slug === '' || name === '') return undefined
  const attachments = Array.isArray(value['attachments'])
    ? value['attachments'].filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : []
  return {
    slug,
    name,
    description: readString(value['description']),
    origin: value['origin'] === 'personal' ? 'personal' : 'builtin',
    attachments,
  }
}

/**
 * Read one gate answer into a state.
 *
 * The four answers stay four for the same reason the MCP area's do: a
 * deployment older than the route cannot be helped by a retry, a signed-out
 * browser needs a sign-in rather than a retry, a failed read is the one a
 * retry fixes, and an account with no skills is an answer said in words.
 * @param status - the HTTP status.
 * @param body - the parsed body, or undefined when it did not parse.
 * @returns the state this answer means.
 */
export function readAccountSkillsAnswer(status: number, body: unknown): AccountSkillsState {
  if (status === 404) return { status: 'unsupported' }
  if (status === 401) return { status: 'signed-out' }
  if (!isRecord(body)) return { status: 'failed', message: '' }
  if (body['status'] === 'signed-out') return { status: 'signed-out' }
  if (!Array.isArray(body['skills'])) {
    return { status: 'failed', message: readString(body['message']) }
  }
  const skills: AccountSkillRow[] = []
  const seen = new Set<string>()
  for (const entry of body['skills']) {
    const row = readAccountSkillRow(entry)
    // Two rows under one slug name one directory; the second copy would
    // overwrite the first, so offering both offers one outcome twice.
    if (row === undefined || seen.has(row.slug)) continue
    seen.add(row.slug)
    skills.push(row)
  }
  return { status: 'ready', skills }
}

/** What one finished copy left on this machine. */
export interface SkillCopyOutcome {
  /** The skill's name, as the account stores it. */
  name: string
  /** The file that was written. */
  path: string
  /** Whether a file was already there. */
  replaced: boolean
}

/** The host call a copy makes. */
export interface SkillCopyRoute {
  /**
   * Copy one skill from the account onto this machine.
   * @param slug - the skill to copy.
   * @returns what was written, or the host's own refusal.
   */
  install(slug: string): Promise<{ ok: true; outcome: SkillCopyOutcome } | { ok: false; message: string }>
}

/** A store the destination binds to. */
export interface AccountSkillsView {
  getSnapshot(): AccountSkillsSnapshot
  subscribe(listener: () => void): () => void
}

/** Everything the account section renders from. */
export interface AccountSkillsSnapshot {
  /** The account's skills, or why there are none to show. */
  state: AccountSkillsState
  /** Slugs a copy is currently running for. */
  copying: readonly string[]
  /** What the last copy of each slug left behind. */
  copied: Readonly<Record<string, SkillCopyOutcome>>
  /** Why the last copy failed, if one did. */
  error: string
}

/** The state before anything has been read. */
export const INITIAL_ACCOUNT_SKILLS: AccountSkillsSnapshot = {
  state: { status: 'idle' },
  copying: [],
  copied: {},
  error: '',
}

/**
 * Build the source.
 * @param environment - the browser facilities.
 * @param routes - the host call a copy makes.
 * @returns a store plus the two gestures the destination offers.
 */
export function createAccountSkillsSource(
  environment: AccountSkillsEnvironment,
  routes: SkillCopyRoute,
): AccountSkillsView & { refresh(): Promise<void>; copy(slug: string): Promise<void> } {
  let snapshot = INITIAL_ACCOUNT_SKILLS
  const listeners = new Set<() => void>()
  const publish = (next: Partial<AccountSkillsSnapshot>): void => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    refresh: async () => {
      publish({ state: { status: 'loading' } })
      let response: Response
      try {
        response = await environment.request(SKILLS_PATH, { headers: { accept: 'application/json' } })
      } catch {
        // The host itself did not answer. A retry is what fixes that.
        publish({ state: { status: 'failed', message: '' } })
        return
      }
      const body = await response.json().catch(() => undefined) as unknown
      publish({ state: readAccountSkillsAnswer(response.status, body) })
    },

    copy: async (slug: string) => {
      if (snapshot.copying.includes(slug)) return
      publish({ copying: [...snapshot.copying, slug], error: '' })
      const answer = await routes.install(slug)
      const copying = snapshot.copying.filter(entry => entry !== slug)
      if (answer.ok) publish({ copying, copied: { ...snapshot.copied, [slug]: answer.outcome } })
      else publish({ copying, error: answer.message })
    },
  }
}
