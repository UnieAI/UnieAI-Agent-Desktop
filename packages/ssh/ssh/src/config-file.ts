/**
 * The machine list, read from the person's own OpenSSH configuration.
 *
 * Rabi keeps no machine book of its own. A developer who can already
 * `ssh build-box` has written down everything a connection needs — jump
 * hosts, identity files, ports, agent forwarding — and a second list would
 * be a second place to keep correct.
 *
 * This module only ENUMERATES: the aliases a person could pick from. What a
 * chosen alias actually resolves to is OpenSSH's answer, not ours
 * (`resolve.ts`), because every directive here interacts — `Match`, `Host`
 * patterns, later `Include` files, command-line overrides — and a parser that
 * agreed with `ssh` today would disagree with it after any upgrade.
 */

import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'

/** One alias a person can pick, as the configuration file writes it. */
export interface SshHostEntry {
  /** The alias itself: what `ssh <alias>` would take. */
  alias: string
  /** Absolute path of the file that declared it. */
  source: string
}

/** Aliases that name no single machine, so no surface should offer them. */
function selectable(pattern: string): boolean {
  // A pattern is a matcher, not a destination: `Host *` configures every
  // connection and `Host !prod` excludes one. Neither is a place to connect.
  return !pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('!')
}

/**
 * Split one configuration line into its keyword and argument.
 *
 * OpenSSH accepts `Keyword value`, `Keyword=value`, and any mix of spaces
 * around the separator; the keyword is case-insensitive.
 * @param line - one raw line.
 * @returns the lowercased keyword and its verbatim argument, or undefined for a blank or comment line.
 */
export function splitDirective(line: string): { keyword: string; argument: string } | undefined {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return undefined
  const match = /^([A-Za-z][A-Za-z0-9]*)\s*=?\s*(.*)$/.exec(trimmed)
  if (match === null) return undefined
  return { keyword: (match[1] ?? '').toLowerCase(), argument: (match[2] ?? '').trim() }
}

/**
 * Expand one `Include` argument into absolute candidate paths.
 *
 * A relative include resolves against the including file's directory for the
 * system configuration and against `~/.ssh` for a user one — this follows the
 * user rule, which is the only file this package reads by default.
 * @param argument - the verbatim `Include` argument, possibly several patterns.
 * @param base - directory of the including file.
 * @returns absolute paths, with `~` expanded; glob patterns are returned unexpanded.
 */
export function includePaths(argument: string, base: string): string[] {
  return argument.split(/\s+/).filter(part => part !== '').map((part) => {
    const unquoted = part.replace(/^"(.*)"$/, '$1')
    if (unquoted.startsWith('~/')) return join(homedir(), unquoted.slice(2))
    return isAbsolute(unquoted) ? unquoted : join(base, unquoted)
  })
}

/**
 * Read every alias one configuration file offers, following its includes.
 *
 * A missing file is an empty list: a person with no `~/.ssh/config` has no
 * machines yet, which is a state to show rather than an error to raise. A
 * glob inside `Include` is followed only when it names a directory's files
 * literally; unmatched patterns are skipped for the same reason.
 * @param path - absolute path of the configuration file.
 * @param seen - files already read, which stops an include cycle.
 * @returns the aliases in file order, each carrying the file that declared it.
 */
export async function readHostEntries(path: string, seen = new Set<string>()): Promise<SshHostEntry[]> {
  if (seen.has(path)) return []
  seen.add(path)

  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    // Unreadable for any reason — absent, a directory, no permission — is
    // "no aliases from here"; the connection attempt is where a broken
    // configuration must be reported, with ssh's own words.
    return []
  }

  const entries: SshHostEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const directive = splitDirective(line)
    if (directive === undefined) continue
    if (directive.keyword === 'host') {
      for (const pattern of directive.argument.split(/\s+/)) {
        if (pattern !== '' && selectable(pattern)) entries.push({ alias: pattern, source: path })
      }
    } else if (directive.keyword === 'include') {
      for (const included of includePaths(directive.argument, dirname(path))) {
        entries.push(...await readHostEntries(included, seen))
      }
    }
  }
  return entries
}
