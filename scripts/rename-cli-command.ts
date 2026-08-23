/**
 * Rename the command this CLI installs, from `dsh` to `uad`, and undo it with
 * `--reverse`.
 *
 * The package is `@unieai/uad`, so `npm i -g` installing a command called `dsh`
 * is a name nobody chose reading a name nobody typed. This changes the `bin`
 * key, the diagnostic prefix the harness prints, and every invocation in the
 * documentation.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH, because these are not the command:
 *
 * - `DSH_HOME` and the `DSH_CLIENT_*` build variables. Renaming an environment
 *   variable is a migration, not a rename: every deployment that exports it
 *   would silently fall back to a default.
 * - `~/.dsh`, the home directory. Renaming it orphans every profile, session
 *   and credential already on disk.
 * - `dsh.bundle` / `dsh.client` / `dsh.profile` manifest keys, which the Loader
 *   reads out of published packages — including ones already published.
 * - `--dsh-*` CSS custom properties, which are a stylesheet's private
 *   vocabulary and share only a spelling.
 *
 * Those four are separate decisions with their own costs. Bundling them into a
 * cosmetic rename would make a one-line change into a migration nobody asked
 * for.
 *
 * The match is by INVOCATION, not by the bare word. `dsh` appears inside far
 * too much to rewrite on sight, so each pattern below names a form in which the
 * word is unambiguously the command being run.
 */

import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** Repository root, resolved from this file rather than the caller's cwd. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Trees whose contents are generated, vendored, or a historical record. */
const SKIP_SEGMENTS = [
  '/node_modules/', '/lib/', '/dist/', '/.git/', '/.pnpm/',
  // An Agent Note records what was true when it was written.
  '/.agents/notes/',
] as const

/** Skipped only at the repository root: electron-builder's output. */
const SKIP_ROOTS = ['release/'] as const

/**
 * This file.
 *
 * A rewriter whose source carries the strings it rewrites will erase its own
 * mapping on the first run. `rescope-product.ts` learned that by doing it.
 */
const SELF = 'scripts/rename-cli-command.ts'

/** File extensions whose text can carry an invocation. */
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.txt'] as const

/**
 * The forms in which `dsh` is the command.
 *
 * Each is anchored on what FOLLOWS the word — a subcommand, a flag, a closing
 * backtick — or on what precedes it, so the bare word inside `DSH_HOME`,
 * `~/.dsh`, `dsh.bundle` and `--dsh-scrollbar-thumb` is never a candidate.
 */
const FORMS: readonly (readonly [RegExp, string])[] = [
  // `"bin": { "dsh": … }`
  [/(^\s*")dsh("\s*:\s*"[^"]*bin\.js")/gmu, '$1uad$2'],
  // Subcommands and flags: `dsh web`, `dsh plugin add`, `dsh --profile x`.
  [/\bdsh (web|plugin|--profile|--patch|--dump-config|--dump-default-config|--help|--version)\b/gu, 'uad $1'],
  // Package-manager passthroughs: `pnpm dsh …`, `npm run dsh`.
  [/\b(pnpm|npm run|yarn) dsh\b/gu, '$1 uad'],
  // The word alone in code voice: `` `dsh` ``.
  [/`dsh`/gu, '`uad`'],
  // The diagnostic prefix constant.
  [/(const NAME = ')dsh(')/gu, '$1uad$2'],
  // A shell prompt line in documentation: `$ dsh …`.
  [/(^\s*\$ )dsh\b/gmu, '$1uad'],
] as const

/** The same forms, reversed. */
const REVERSED: readonly (readonly [RegExp, string])[] = [
  [/(^\s*")uad("\s*:\s*"[^"]*bin\.js")/gmu, '$1dsh$2'],
  [/\buad (web|plugin|--profile|--patch|--dump-config|--dump-default-config|--help|--version)\b/gu, 'dsh $1'],
  [/\b(pnpm|npm run|yarn) uad\b/gu, '$1 dsh'],
  [/`uad`/gu, '`dsh`'],
  [/(const NAME = ')uad(')/gu, '$1dsh$2'],
  [/(^\s*\$ )uad\b/gmu, '$1dsh'],
] as const

/**
 * Rewrite one file's text.
 * @param text - the file's contents.
 * @param forms - the patterns to apply.
 * @returns the rewritten text and how many replacements were made.
 */
export function rewrite(
  text: string,
  forms: readonly (readonly [RegExp, string])[],
): { text: string; count: number } {
  let out = text
  let count = 0
  for (const [pattern, replacement] of forms) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), (match) => {
      count += 1
      return match.replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), replacement)
    })
  }
  return { text: out, count }
}

/** Every file whose text is in scope. */
function files(): string[] {
  const walk = (pattern: string): string[] => globSync(pattern, { cwd: ROOT, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => `${entry.parentPath}/${entry.name}`.slice(ROOT.length).replace(/^\//u, ''))
  return [...walk('**/*'), ...walk('.github/**/*')]
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => !SKIP_SEGMENTS.some(segment => `/${file}`.includes(segment)))
    .filter(file => !SKIP_ROOTS.some(root => file.startsWith(root)))
    .filter(file => file !== SELF)
    .filter(file => TEXT_EXTENSIONS.some(extension => file.endsWith(extension)))
}

const { values } = parseArgs({ options: { check: { type: 'boolean' }, reverse: { type: 'boolean' } } })
const forms = values.reverse === true ? REVERSED : FORMS

let changedFiles = 0
let changedForms = 0
for (const file of files()) {
  const path = resolve(ROOT, file)
  const before = readFileSync(path, 'utf8')
  const { text, count } = rewrite(before, forms)
  if (text === before) continue
  changedFiles += 1
  changedForms += count
  if (values.check !== true) writeFileSync(path, text)
}

const verb = values.check === true ? 'would rewrite' : 'rewrote'
console.log(`rename-cli-command: ${verb} ${changedForms} invocation(s) across ${changedFiles} file(s).`)
if (values.check === true && changedFiles > 0) process.exitCode = 1
