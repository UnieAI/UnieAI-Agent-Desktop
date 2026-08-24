/**
 * The list of MCP servers a person added, and what a valid entry is.
 *
 * Kept apart from the plugin body so the shape can be tested and so the browser
 * half can import the field names without pulling a host plugin into a bundle.
 *
 * STREAMABLE HTTP ONLY, DELIBERATELY. `mcp-client` also speaks stdio, which
 * starts a server by running a command. Offering that in a form would turn an
 * "add a server" field into a way to run any program on the machine — from a
 * page, with the agent's own privileges, and with nothing in the transaction
 * that looks like consent to execute. A URL is a different kind of thing: it
 * reaches something already running that someone else already decided to run.
 * A person who genuinely wants a stdio server can still declare one in the
 * profile's own patch layer, where the act is explicit and reviewable.
 */

import z from '@unieai/schemastery'

/** Durable settings namespace this list lives under. */
export const MCP_SERVERS_NAMESPACE = 'mcp.servers'

/** Field inside that namespace holding the list. */
export const MCP_SERVERS_FIELD = 'servers'

/**
 * Shape of a server name.
 *
 * `mcp-client` turns it into the prefix of every tool it publishes
 * (`mcp__<name>__<tool>`), so it is a model-facing identifier rather than a
 * label: the same characters the tool-name budget allows, and no more.
 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u

/** One server as a person entered it. */
export interface McpServerEntry {
  /** Local namespace for this server's tools; unique across the list. */
  name: string
  /** The endpoint to dial. */
  url: string
  /**
   * Bearer presented to that endpoint, or empty for a server that needs none.
   *
   * Stored in the settings document like every other value here. That is the
   * honest position rather than a claimed one: this file already holds provider
   * credentials, the harness reads it as the person who owns the machine, and a
   * token the desktop cannot read is a token it cannot send.
   */
  token: string
  /** Whether to mount it at all; a disabled row is kept, not deleted. */
  enabled: boolean
}

/** The namespace's schema. */
export const McpServersSettings = z.object({
  servers: z.array(z.object({
    name: z.string().default(''),
    url: z.string().default(''),
    token: z.string().default(''),
    enabled: z.boolean().default(true),
  })).default([]),
})

/** What the settings document holds under {@link MCP_SERVERS_NAMESPACE}. */
export interface McpServersSettingsValue {
  servers: McpServerEntry[]
}

/** Why one entry cannot be mounted. */
export type EntryProblem = 'name.missing' | 'name.shape' | 'name.duplicate' | 'url.missing' | 'url.scheme'

/**
 * Check one entry against the rest of the list.
 *
 * Returns every problem rather than the first, because a form that reports one
 * fault per attempt makes a person fix three things in three round trips.
 * @param entry - the candidate.
 * @param others - the names already taken by other rows.
 * @returns the problems, empty when the entry is mountable.
 */
export function problemsWith(entry: McpServerEntry, others: readonly string[]): EntryProblem[] {
  const problems: EntryProblem[] = []
  const name = entry.name.trim()
  if (name === '') problems.push('name.missing')
  else if (!SERVER_NAME_PATTERN.test(name)) problems.push('name.shape')
  else if (others.includes(name)) problems.push('name.duplicate')

  const url = entry.url.trim()
  if (url === '') problems.push('url.missing')
  else {
    let parsed: URL | undefined
    try {
      parsed = new URL(url)
    } catch {
      problems.push('url.scheme')
    }
    // `http:` is allowed on purpose: a local server on loopback is the ordinary
    // case, and refusing it would push people towards a proxy that adds nothing.
    if (parsed !== undefined && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      problems.push('url.scheme')
    }
  }
  return problems
}

/**
 * The entries that may be mounted, in list order.
 *
 * An invalid or disabled row is skipped rather than rejected: the list is a
 * person's working document, and one row they have not finished typing must not
 * stop the four that are ready.
 * @param servers - the stored list.
 * @returns the mountable entries.
 */
export function mountable(servers: readonly McpServerEntry[]): McpServerEntry[] {
  const taken: string[] = []
  const out: McpServerEntry[] = []
  for (const entry of servers) {
    if (!entry.enabled) continue
    if (problemsWith(entry, taken).length > 0) continue
    taken.push(entry.name.trim())
    out.push({ ...entry, name: entry.name.trim(), url: entry.url.trim() })
  }
  return out
}

/**
 * Whether two mount plans differ in anything that requires remounting.
 * @param left - one plan.
 * @param right - the other.
 * @returns true when the difference matters.
 */
export function differs(left: readonly McpServerEntry[], right: readonly McpServerEntry[]): boolean {
  if (left.length !== right.length) return true
  return left.some((entry, index) => {
    const other = right[index]
    return other === undefined
      || entry.name !== other.name || entry.url !== other.url || entry.token !== other.token
  })
}
