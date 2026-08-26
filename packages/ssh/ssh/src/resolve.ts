/**
 * What an alias means, answered by OpenSSH itself.
 *
 * `ssh -G <alias>` prints the effective configuration for a connection that
 * has not been made: every `Host` pattern, `Match` block, `Include` file and
 * default already applied. Reading that output is the only way to agree with
 * the client that will actually connect — the alternative is a second
 * implementation of a configuration language whose evaluation order is not
 * ours to define.
 */

/** Effective settings for one alias, as OpenSSH resolved them. */
export interface ResolvedSshHost {
  /** The alias asked about. */
  alias: string
  /** Host actually connected to; equals the alias when no `HostName` applies. */
  hostName: string
  /** Login user OpenSSH would use. */
  user: string
  /** Port OpenSSH would use. */
  port: number
  /** Jump hosts, in order, or empty when the connection is direct. */
  proxyJump: readonly string[]
  /** Identity files OpenSSH would offer, in order. */
  identityFiles: readonly string[]
}

/**
 * Parse `ssh -G` output into a keyword table.
 *
 * Keywords repeat (`identityfile` appears once per file), so every value is
 * kept in order rather than the last winning.
 * @param text - complete stdout of `ssh -G`.
 * @returns lowercased keyword to its values in file order.
 */
export function parseEffectiveConfig(text: string): Map<string, string[]> {
  const table = new Map<string, string[]>()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const space = trimmed.indexOf(' ')
    const keyword = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase()
    const value = space === -1 ? '' : trimmed.slice(space + 1).trim()
    const existing = table.get(keyword)
    if (existing === undefined) table.set(keyword, [value])
    else existing.push(value)
  }
  return table
}

/**
 * Read the fields a surface needs out of a resolved keyword table.
 *
 * A field OpenSSH did not print keeps a documented stand-in rather than
 * throwing: `-G` prints its own defaults, so an absent keyword means a
 * client older than the field, not a broken configuration.
 * @param alias - the alias asked about.
 * @param table - the parsed `ssh -G` table.
 * @returns the resolved host.
 */
export function resolvedHostOf(alias: string, table: Map<string, string[]>): ResolvedSshHost {
  const first = (keyword: string): string => table.get(keyword)?.[0] ?? ''
  const port = Number.parseInt(first('port'), 10)
  const jump = first('proxyjump')
  return {
    alias,
    hostName: first('hostname') === '' ? alias : first('hostname'),
    user: first('user'),
    // OpenSSH always prints a port; a client that did not is treated as
    // the protocol default rather than as port zero.
    port: Number.isFinite(port) && port > 0 ? port : 22,
    proxyJump: jump === '' || jump.toLowerCase() === 'none' ? [] : jump.split(','),
    identityFiles: table.get('identityfile') ?? [],
  }
}
