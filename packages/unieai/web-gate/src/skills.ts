/**
 * Reads the skills the signed-in account keeps in the web product, and the
 * one document a person asks to copy onto this machine.
 *
 * A skill is a row there and a file here. The product publishes each one as
 * Markdown with the frontmatter this harness parses (`lib/desktop/skills.ts`),
 * so nothing on this side interprets a skill: the listing is names and
 * descriptions for choosing from, and the document is bytes to write.
 *
 * A COPY, NOT A LINK. What lands on this machine is that machine's file. The
 * product tracks nothing about it, editing it here changes nothing there, and
 * a later copy overwrites what is here — which the surface asking for the copy
 * is the right place to say, because only it knows whether a file is already
 * open in front of someone.
 *
 * The body is fetched one skill at a time rather than with the listing. An
 * account with fifty skills has fifty documents nobody asked for, and the
 * listing is read every time the page opens.
 */

/** One skill the account keeps in the product, as a page may see it. */
export interface AccountSkill {
  /** Stable identifier; also the directory name a copy is written into. */
  slug: string
  /** The skill's own name, which is also its `/name` invocation. */
  name: string
  /** One-line routing description. */
  description: string
  /** Whether it is the account's own skill or a built-in it runs with. */
  origin: 'personal' | 'builtin'
  /** Whether the account has it turned on for its own turns. */
  enabled: boolean
  /** Auxiliary files it carries, by name; the product serves none of their bytes. */
  attachments: string[]
}

/** One skill's `SKILL.md`, as the product renders it. */
export interface AccountSkillDocument {
  /** The slug asked for. */
  slug: string
  /** The skill's name, for a surface that reports what it wrote. */
  name: string
  /** The whole file, frontmatter included. */
  content: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string => typeof value === 'string' ? value : ''

/** Narrow a reported list of file names, dropping anything that is not one. */
function readNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/**
 * Narrow one reported skill.
 *
 * A row with no slug or no name is dropped: the slug is what a copy is asked
 * for by and the name is what a person recognises it as, and a row missing
 * either cannot be acted on. A slug that is not a plain directory name is
 * dropped for a stronger reason — it is joined onto a skills directory on this
 * machine, and a separator or a parent reference in it would write somewhere
 * else. The product refuses to publish one, and this is the second place that
 * must be true, because this side is where the path is built.
 * @param value - a candidate skill object.
 * @returns the skill, or undefined when the value is not one.
 */
export function readAccountSkill(value: unknown): AccountSkill | undefined {
  if (!isRecord(value)) return undefined
  const slug = readString(value['slug'])
  const name = readString(value['name'])
  if (!isPlainSegment(slug) || name === '') return undefined
  return {
    slug,
    name,
    description: readString(value['description']),
    origin: value['origin'] === 'personal' ? 'personal' : 'builtin',
    // Absent reads as on: a build of the product that reports no flag still
    // runs the skill, and showing it as off would be a claim about the account.
    enabled: value['enabled'] !== false,
    attachments: readNames(value['attachments']),
  }
}

/**
 * Whether a slug is a directory name and nothing more.
 *
 * Lower-case letters, digits, dot, underscore and hyphen, never a separator,
 * and never only dots — `.` and `..` are the two names that resolve to a
 * directory other than the one they are joined to.
 * @param slug - the reported identifier.
 * @returns whether it is safe to use as one path segment.
 */
export function isPlainSegment(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) && !/^\.+$/.test(slug)
}

/** Why the account's skill list could not be read, in the words a person gets. */
export type AccountSkillsFailure =
  /** The product could not be reached at all: offline, DNS, TLS, wrong origin. */
  | { kind: 'unreachable' }
  /** The product answered, and said no or said something broken. */
  | { kind: 'status'; status: number }
  /** The product answered 200 with a body this cannot read. */
  | { kind: 'malformed' }

/** Either the account's skills, or why they could not be read. */
export type AccountSkillsAnswer =
  | { ok: true; skills: AccountSkill[] }
  | { ok: false; failure: AccountSkillsFailure }

/**
 * Read the skills this account keeps in the product.
 *
 * The failure is REPORTED, not flattened. Four different things send a person
 * to the same screen — the product is unreachable, the key was refused, the
 * route is not there, the answer did not parse — and one sentence covering all
 * four ("could not be read") tells them nothing they can act on and tells a
 * bug report nothing either. Each says which it was.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param signal - cancels the request.
 * @returns the skills, or the reason they could not be read.
 */
export async function fetchAccountSkills(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AccountSkillsAnswer> {
  const response = await fetch(`${baseUrl}/api/desktop/skills`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return { ok: false, failure: { kind: 'unreachable' } }
  if (!response.ok) return { ok: false, failure: { kind: 'status', status: response.status } }
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body) || !Array.isArray(body['skills'])) {
    return { ok: false, failure: { kind: 'malformed' } }
  }
  const skills: AccountSkill[] = []
  const seen = new Set<string>()
  for (const entry of body['skills']) {
    const skill = readAccountSkill(entry)
    // Two rows under one slug are two names for one directory: the second copy
    // would overwrite the first, and offering both is offering a choice with
    // one outcome.
    if (skill === undefined || seen.has(skill.slug)) continue
    seen.add(skill.slug)
    skills.push(skill)
  }
  return { ok: true, skills }
}

/**
 * The sentence a failed read gets.
 * @param failure - what went wrong.
 * @param baseUrl - the origin that was asked, named so a wrong one is visible.
 * @returns one sentence naming the cause.
 */
export function accountSkillsFailureMessage(failure: AccountSkillsFailure, baseUrl: string): string {
  if (failure.kind === 'unreachable') {
    return `The skills on your UnieAI account could not be read: ${baseUrl} could not be reached.`
  }
  if (failure.kind === 'malformed') {
    return `The skills on your UnieAI account could not be read: ${baseUrl} answered with something this build does not understand.`
  }
  if (failure.status === 401 || failure.status === 403) {
    return 'The skills on your UnieAI account could not be read: this machine\'s access was refused. Sign in again.'
  }
  if (failure.status === 404) {
    return `The skills on your UnieAI account could not be read: ${baseUrl} does not serve a skills list.`
  }
  return `The skills on your UnieAI account could not be read: ${baseUrl} answered ${String(failure.status)}.`
}

/** Why a document could not be read: absent from the account, or unreadable. */
export type SkillDocumentFailure = 'not-found' | 'unreadable'

/**
 * Read one skill's `SKILL.md`.
 *
 * `not-found` is kept apart from `unreadable` because they lead to different
 * sentences: a skill the account no longer has is a stale listing worth
 * re-reading, and a failed read is worth retrying.
 * @param baseUrl - the web product's origin, without a trailing slash.
 * @param apiKey - the desktop API key from the gate's session.
 * @param slug - the skill to read.
 * @param signal - cancels the request.
 * @returns the document, or which of the two failures happened.
 */
export async function fetchAccountSkill(
  baseUrl: string,
  apiKey: string,
  slug: string,
  signal?: AbortSignal,
): Promise<AccountSkillDocument | SkillDocumentFailure> {
  if (!isPlainSegment(slug)) return 'not-found'
  const response = await fetch(`${baseUrl}/api/desktop/skills/${encodeURIComponent(slug)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: signal ?? null,
  }).catch(() => undefined)
  if (response === undefined) return 'unreadable'
  if (response.status === 404) return 'not-found'
  if (!response.ok) return 'unreadable'
  const body = await response.json().catch(() => undefined) as unknown
  if (!isRecord(body)) return 'unreadable'
  const content = readString(body['content'])
  // An empty body is not a document. A skill file with no text teaches the
  // model nothing and would replace one that did.
  if (content.trim() === '') return 'unreadable'
  const name = readString(body['name'])
  return { slug, name: name === '' ? slug : name, content }
}
