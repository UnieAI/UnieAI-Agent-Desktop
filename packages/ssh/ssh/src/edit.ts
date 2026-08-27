/**
 * Adding and removing a machine in the person's own OpenSSH configuration.
 *
 * The file is theirs, not ours. It carries comments they wrote, an order
 * they chose, `Include` lines pointing at other files, `Match` blocks whose
 * meaning depends on position, and options this package has never heard of.
 * So editing here is deliberately narrow: **append to add, delete a whole
 * block to remove, and never rewrite anything else.** A form that parsed the
 * file into fields and wrote it back would lose the comments and the order
 * on the first save, and nothing would tell the person until they looked.
 *
 * What that rules out is stated as refusals rather than attempted badly:
 * a machine declared in an included file, or one sharing a `Host` line with
 * other aliases, cannot be removed from here — those edits change a line
 * someone else's machine depends on, and the person's own editor is where
 * that belongs.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { splitDirective } from './config-file.ts'

/** What a new machine needs written down. */
export interface SshHostDraft {
  /** The alias `ssh <alias>` will take; the only required field. */
  alias: string
  /** Host to connect to, when it differs from the alias. */
  hostName?: string
  /** Login user, when it differs from the local one. */
  user?: string
  /** Port, when it is not 22. */
  port?: number
  /** Private key file to offer. */
  identityFile?: string
  /** Machine to reach it through. */
  proxyJump?: string
}

/** Why an edit was refused. */
export type SshEditRefusal =
  | { kind: 'invalid-alias'; alias: string }
  | { kind: 'duplicate'; alias: string }
  | { kind: 'not-found'; alias: string }
  | { kind: 'shared-line'; alias: string; line: string }
  | { kind: 'declared-elsewhere'; alias: string; source: string }

/**
 * An alias OpenSSH will accept as one destination.
 *
 * Patterns are excluded on purpose: `Host *` configures every connection,
 * and writing one from a form that says "add a machine" would silently
 * change how every other machine is reached.
 */
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Compose the block one new machine adds to a configuration file.
 *
 * Only the fields a person filled in are written. An option written with its
 * default value looks like a decision, and the next reader cannot tell it
 * from one.
 * @param draft - the machine to write down.
 * @returns the text to append, starting with a blank line.
 */
export function hostBlock(draft: SshHostDraft): string {
  const lines = [`Host ${draft.alias}`]
  if (draft.hostName !== undefined && draft.hostName !== '') lines.push(`  HostName ${draft.hostName}`)
  if (draft.user !== undefined && draft.user !== '') lines.push(`  User ${draft.user}`)
  if (draft.port !== undefined && draft.port !== 22) lines.push(`  Port ${String(draft.port)}`)
  if (draft.identityFile !== undefined && draft.identityFile !== '') lines.push(`  IdentityFile ${draft.identityFile}`)
  if (draft.proxyJump !== undefined && draft.proxyJump !== '') lines.push(`  ProxyJump ${draft.proxyJump}`)
  return `\n${lines.join('\n')}\n`
}

/**
 * The line span one alias's block occupies, when it can be identified.
 *
 * A block runs from its `Host` line to the next `Host` or `Match` line, so
 * the options under it travel with it — but not the blank and comment lines
 * at the end of that run, which introduce whatever comes next. Everything
 * else about the file — comments, blank lines, includes — is somebody's and
 * stays.
 * @param text - the configuration file's contents.
 * @param alias - the machine to find.
 * @returns the zero-based line range `[start, end)`, or a refusal.
 */
export function blockSpan(text: string, alias: string): { start: number; end: number } | SshEditRefusal {
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const directive = splitDirective(lines[index] ?? '')
    if (directive?.keyword !== 'host') continue
    const patterns = directive.argument.split(/\s+/).filter(part => part !== '')
    if (!patterns.includes(alias)) continue
    if (patterns.length > 1) {
      // Deleting the line would take the other machines with it, and
      // rewriting it would be the in-place edit this module does not do.
      return { kind: 'shared-line', alias, line: (lines[index] ?? '').trim() }
    }
    let end = index + 1
    while (end < lines.length) {
      const next = splitDirective(lines[end] ?? '')
      if (next?.keyword === 'host' || next?.keyword === 'match') break
      end += 1
    }
    // Trailing blank and comment lines are given back. A comment sitting
    // just above the next `Host` is that machine's heading — the reason
    // somebody wrote it down — and a block that swallowed it would delete
    // one machine and silently take another's notes with it.
    while (end > index + 1) {
      const line = (lines[end - 1] ?? '').trim()
      if (line !== '' && !line.startsWith('#')) break
      end -= 1
    }
    // A blank line immediately above belongs to the block this added, so
    // removing does not leave a growing gap where machines used to be.
    const start = index > 0 && (lines[index - 1] ?? '').trim() === '' ? index - 1 : index
    return { start, end }
  }
  return { kind: 'not-found', alias }
}

/**
 * Add one machine to a configuration file.
 *
 * Append-only: whatever the file already says is byte-for-byte unchanged,
 * and the new block goes at the end where a person will find it.
 * @param path - the configuration file to write.
 * @param draft - the machine to add.
 * @returns nothing, or the refusal that stopped it.
 */
export async function addHost(path: string, draft: SshHostDraft): Promise<SshEditRefusal | undefined> {
  if (!ALIAS.test(draft.alias)) return { kind: 'invalid-alias', alias: draft.alias }
  const text = await readOrEmpty(path)
  const found = blockSpan(text, draft.alias)
  if (!('kind' in found) || found.kind !== 'not-found') {
    return 'kind' in found ? found : { kind: 'duplicate', alias: draft.alias }
  }
  await writeFile(path, `${text.trimEnd()}${text.trim() === '' ? '' : '\n'}${hostBlock(draft)}`, { mode: 0o600 })
  return undefined
}

/**
 * Remove one machine from a configuration file.
 *
 * Only a block this file declares alone: an alias sharing a `Host` line, or
 * one that came from an included file, is refused with which it was, because
 * either edit changes a line another machine depends on.
 * @param path - the configuration file to write.
 * @param alias - the machine to remove.
 * @param declaredIn - the file the alias was actually read from.
 * @returns nothing, or the refusal that stopped it.
 */
export async function removeHost(
  path: string,
  alias: string,
  declaredIn?: string,
): Promise<SshEditRefusal | undefined> {
  if (declaredIn !== undefined && declaredIn !== path) {
    return { kind: 'declared-elsewhere', alias, source: declaredIn }
  }
  const text = await readOrEmpty(path)
  const span = blockSpan(text, alias)
  if ('kind' in span) return span
  const lines = text.split('\n')
  lines.splice(span.start, span.end - span.start)
  await writeFile(path, lines.join('\n'), { mode: 0o600 })
  return undefined
}

/**
 * Read a configuration file, treating an absent one as empty.
 * @param path - the file to read.
 * @returns its contents, or an empty string.
 */
async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    // A person with no configuration yet is adding their first machine.
    return ''
  }
}
