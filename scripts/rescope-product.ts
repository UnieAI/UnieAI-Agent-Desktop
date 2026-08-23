/**
 * Move this fork's own packages from the `@unieai` scope to `@unieai`,
 * and undo that move with `--reverse`.
 *
 * WHY IT HAS TO HAPPEN. Every package here is named `@unieai/…`, and that
 * scope belongs to DeepSeek. Publishing under it is not merely impolite, it is
 * impossible: npm refuses a scope the publisher does not own. So a fork that
 * wants a registry at all has to be renamed, and it has to be renamed whole —
 * `dsh` resolves a profile's bundles by package name at first run, so a CLI
 * published alone would fetch names that are not there.
 *
 * WHY THE MATCH IS SAFE. Unlike the vendored rescope this is modelled on, every
 * name rewritten here begins with `@unieai/`, a string that means exactly
 * one thing in this repository. There is no `dsh` ambiguity to navigate: the
 * `--dsh-*` CSS variables, the `DSH_HOME` environment variable, the `dsh web`
 * command and the `dsh.bundle` manifest key are all left alone because none of
 * them carries the scope. What the delimiters below add is protection against a
 * PREFIX match — `@unieai/uad` must not rewrite inside
 * `@unieai/uad-web-app`, which is why names are tried longest first and
 * why a match must end at a quote or a subpath separator.
 *
 * DIRECTORIES AND VERSIONS DO NOT MOVE. `packages/client/ui-plugins-page/`
 * stays where it is, and every version string is untouched. What changes is the
 * name a package publishes under and every reference to that name.
 */

import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** Repository root, resolved from this file rather than the caller's cwd. */
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The scope every package in this fork currently publishes under. */
const FROM_SCOPE = '@deepseek-ai'

/** The scope it moves to. */
const TO_SCOPE = '@unieai'

/**
 * The CLI's own rename, which is not a scope swap.
 *
 * `@unieai/uad` is the name a person types (`npx @unieai/uad web`),
 * and this product is UnieAI Agent Desktop. Its siblings follow it so the whole
 * scope reads as one product rather than a CLI called `uad` surrounded by
 * dependencies still called `dsh`.
 */
const FROM_PREFIX = 'dsh'

/** What that prefix becomes. */
const TO_PREFIX = 'uad'

/** Where package manifests live; the mapping is derived from them, never typed. */
const MANIFEST_GLOBS = [
  'package.json',
  'packages/*/*/package.json',
  'apps/*/package.json',
  'vendor/*/package.json',
  'native/*/package.json',
  'native/*/packages/*/package.json',
  'website/package.json',
] as const

/** Trees whose contents are generated, vendored blobs, or version control. */
const SKIP_SEGMENTS = [
  '/node_modules/', '/lib/', '/dist/', '/.git/', '/.pnpm/',
  // Historical record, not current authority. See `files()`.
  '/.agents/notes/',
] as const

/**
 * Paths skipped only at the repository root.
 *
 * `release/` is electron-builder's output. Matching it as a path SEGMENT also
 * excluded `scripts/release/`, which is source — and which carries the release
 * family's own `startsWith('@unieai/')` guard, so the rename left behind a
 * check that refused every renamed package.
 */
const SKIP_ROOTS = ['release/'] as const

/**
 * This file. A rewriter whose source carries the strings it rewrites will erase
 * its own mapping on the first run — `FROM_SCOPE` became `TO_SCOPE`, after
 * which every name matched itself and 62,625 no-op "rewrites" were reported as
 * success. It excludes itself for the same reason a sed script is not piped
 * through itself.
 */
const SELF = 'scripts/rescope-product.ts'

/** File extensions whose text carries package names. */
const TEXT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonl', '.md', '.yml', '.yaml', '.py', '.txt'] as const

/** One name change. */
interface Rename {
  readonly from: string
  readonly to: string
}

/**
 * Translate one package name into the target scope.
 * @param name - the current name.
 * @returns the renamed value, or undefined when the name is out of scope.
 */
function renamed(name: string): string | undefined {
  if (!name.startsWith(`${FROM_SCOPE}/`)) return undefined
  const bare = name.slice(FROM_SCOPE.length + 1)
  if (bare === FROM_PREFIX) return `${TO_SCOPE}/${TO_PREFIX}`
  if (bare.startsWith(`${FROM_PREFIX}-`)) return `${TO_SCOPE}/${TO_PREFIX}-${bare.slice(FROM_PREFIX.length + 1)}`
  // Vendored framework packages and the native addon keep their own names and
  // move scope only: they are recognisable upstream projects, and renaming
  // `cordis` to `uad-cordis` would hide what they are.
  return `${TO_SCOPE}/${bare}`
}

/**
 * Every rename this repository's manifests imply, longest name first.
 *
 * Longest first is load-bearing: `@unieai/uad` is a prefix of
 * `@unieai/uad-base`, and applying the short one first would corrupt the
 * long one into `@unieai/uad-base` by a different route — right answer here, by
 * luck, and wrong the moment two names differ after their shared prefix.
 * @param reverse - swap the direction.
 * @returns the renames to apply.
 */
function renames(reverse: boolean): Rename[] {
  const names = new Set<string>()
  for (const pattern of MANIFEST_GLOBS) {
    for (const file of globSync(pattern, { cwd: ROOT })) {
      const manifest = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as { name?: unknown }
      if (typeof manifest.name === 'string') names.add(manifest.name)
    }
  }
  const list: Rename[] = []
  for (const name of names) {
    const to = renamed(name)
    if (to === undefined) continue
    list.push(reverse ? { from: to, to: name } : { from: name, to })
  }
  return list.sort((left, right) => right.from.length - left.from.length)
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/**
 * Rewrite one file's text.
 *
 * A name is replaced only where it is complete: followed by a quote, a
 * backtick, whitespace, a subpath separator, or the end of the line. Anything
 * else is a longer name that its own entry will handle.
 * @param text - the file's contents.
 * @param list - the renames to apply.
 * @returns the rewritten text and how many replacements were made.
 */
export function rewrite(text: string, list: readonly Rename[], reverse = false): { text: string; count: number } {
  let out = text
  let count = 0
  for (const rename of list) {
    const pattern = new RegExp(`${escape(rename.from)}(?=$|[^A-Za-z0-9_-])`, 'gmu')
    out = out.replace(pattern, () => { count += 1; return rename.to })
  }
  // Residual pass: what the exact names cannot reach.
  //
  // A repository describes its own packages as well as naming them —
  // `@unieai/uad-<pkg>` in a layout diagram, `"@unieai/.+"` in a knip
  // pattern, `@unieai/uad-*` in a sentence. None of those is a package
  // name, so none matches an entry above, and every one of them would go on
  // teaching a scope this fork no longer publishes under. They follow the same
  // mapping because they describe the same thing.
  for (const [from, to] of residuals(reverse)) {
    const pattern = new RegExp(escape(from), 'gu')
    out = out.replace(pattern, () => { count += 1; return to })
  }
  return { text: out, count }
}

/**
 * Scope-and-prefix fragments, longest first so the prefixed form wins.
 * @param reverse - swap the direction.
 * @returns from/to pairs to apply after the exact names.
 */
function residuals(reverse: boolean): readonly (readonly [string, string])[] {
  // Both the plain and the regex-escaped spelling of the separator. Source that
  // MATCHES package names writes them as patterns — `/^@unieai\/uad-…/` in
  // the client bundle-purity gate — and a rewrite that knew only the plain form
  // left those patterns testing for a scope nothing publishes under any more.
  // They compile, they run, and they silently match nothing.
  const pairs = [
    [`${FROM_SCOPE}/${FROM_PREFIX}-`, `${TO_SCOPE}/${TO_PREFIX}-`],
    [`${FROM_SCOPE}\\/${FROM_PREFIX}-`, `${TO_SCOPE}\\/${TO_PREFIX}-`],
    [`${FROM_SCOPE}/${FROM_PREFIX}`, `${TO_SCOPE}/${TO_PREFIX}`],
    [`${FROM_SCOPE}\\/${FROM_PREFIX}`, `${TO_SCOPE}\\/${TO_PREFIX}`],
    [`${FROM_SCOPE}/`, `${TO_SCOPE}/`],
    [`${FROM_SCOPE}\\/`, `${TO_SCOPE}\\/`],
    // The scope with no separator at all, which is how prose names it: "must
    // name an @unieai package". Last, so every longer form has had its
    // turn and this one only ever sees what they left.
    // Anchor slugs. A generated catalogue turns `@deepseek-ai/dsh-tools` into
    // the fragment `#deepseek-aidsh-tools` by dropping the punctuation, and a
    // README links to that fragment. Such links break silently: the anchor is
    // simply not in the regenerated page any more, and nothing notices until
    // someone clicks it.
    [`${FROM_SCOPE.slice(1)}${FROM_PREFIX}-`, `${TO_SCOPE.slice(1)}${TO_PREFIX}-`],
    [`${FROM_SCOPE.slice(1)}${FROM_PREFIX}`, `${TO_SCOPE.slice(1)}${TO_PREFIX}`],
    [FROM_SCOPE, TO_SCOPE],
    [FROM_SCOPE.slice(1), TO_SCOPE.slice(1)],
  ] as const
  return reverse ? pairs.map(([from, to]) => [to, from] as const) : pairs
}

/**
 * Every file whose text is in scope.
 *
 * `dot: true` reaches `.github/`, whose workflows name packages in `--filter`
 * arguments. `.agents/notes/` is reached too and then excluded: an Agent Note
 * records what was true when it was written, and rewriting one would make the
 * record disagree with the commit it describes. `docs/` is the opposite case
 * and does follow the rename — a page teaching a name that no longer resolves
 * is simply wrong.
 */
function files(): string[] {
  // Two globs, and `withFileTypes` rather than an option name that reads right.
  // Node's built-in `globSync` has neither `dot` nor `nodir`; both are silently
  // ignored when passed, and the first of those looked like a clean run over
  // `.github/` while never visiting it. Only the entry types it really reports
  // are trusted here.
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
// An empty name list is the ordinary state AFTER a rescope: the manifests
// already carry the new names, so nothing matches them. The residual pass still
// has work — patterns and prose do not live in manifests — so the run is not
// refused here. What IS refused is a run that changes nothing at all, below.
const list = renames(values.reverse === true)

let changedFiles = 0
let changedNames = 0
for (const file of files()) {
  const path = resolve(ROOT, file)
  const before = readFileSync(path, 'utf8')
  const { text, count } = rewrite(before, list, values.reverse === true)
  if (count === 0) continue
  changedFiles += 1
  changedNames += count
  if (values.check !== true) writeFileSync(path, text)
}

const verb = values.check === true ? 'would rewrite' : 'rewrote'
console.log(`rescope-product: ${list.length} package names; ${verb} ${changedNames} reference(s) across ${changedFiles} file(s).`)
if (values.check === true && changedFiles > 0) process.exitCode = 1
