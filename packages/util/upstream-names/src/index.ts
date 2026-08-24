/**
 * Mapping between this product's package names and the upstream harness names
 * they answer to.
 *
 * WHY THIS EXISTS. Every package here was renamed from `@deepseek-ai/dsh-*` to
 * `@unieai/uad-*` ([mapping](../../../../docs/rescope.md)). The community
 * plugin ecosystem was not, and could not be: a published plugin declares peer
 * dependencies and bundler externals under the upstream names, and those
 * manifests are already on npm. Nothing about those plugins is incompatible —
 * only the spelling of what they ask for.
 *
 * Two faces need the same mapping and reach it from opposite directions, which
 * is why it lives in neither of them. The host publishes each installed package
 * under its upstream name as well (`legacyNameFor`); the browser's module table
 * answers an upstream request with the product package (`productNameFor`).
 * Stating the rule twice would let the two drift, and a drift here fails as an
 * unresolvable import rather than as a type error.
 *
 * @module @unieai/uad-upstream-names
 */

/** Scope the upstream harness publishes under. */
export const UPSTREAM_SCOPE = '@deepseek-ai'

/** Package-name prefix the upstream harness uses inside its scope. */
export const UPSTREAM_PREFIX = 'dsh'

/** Scope this product publishes under. */
export const PRODUCT_SCOPE = '@unieai'

/** Package-name prefix this product uses inside its scope. */
export const PRODUCT_PREFIX = 'uad'

/**
 * The bare product package — the one a person installs and runs.
 *
 * Separate from {@link PRODUCT_PREFIX} because the command took the product's
 * own name while the library packages kept the `uad-` prefix they were first
 * published under. Nobody types a library's name, and renaming those would
 * burn a registry name each to change nothing a user can see.
 */
export const PRODUCT_ENTRY = 'rabi'

/** The bare upstream package, which shares its prefix's spelling. */
export const UPSTREAM_ENTRY = UPSTREAM_PREFIX

/**
 * Rewrite one scoped name between the two vocabularies.
 * @param name - the name to rewrite.
 * @param fromScope - scope the name is expected to carry.
 * @param fromPrefix - prefix inside that scope.
 * @param fromEntry - bare package name inside that scope.
 * @param toScope - scope to rewrite to.
 * @param toPrefix - prefix inside the target scope.
 * @param toEntry - bare package name inside the target scope.
 * @returns the rewritten name, or undefined when the name is from another scope.
 */
function rescope(
  name: string,
  fromScope: string, fromPrefix: string, fromEntry: string,
  toScope: string, toPrefix: string, toEntry: string,
): string | undefined {
  if (!name.startsWith(`${fromScope}/`)) return undefined
  const bare = name.slice(fromScope.length + 1)
  if (bare === fromEntry) return `${toScope}/${toEntry}`
  if (bare.startsWith(`${fromPrefix}-`)) return `${toScope}/${toPrefix}-${bare.slice(fromPrefix.length + 1)}`
  // Vendored framework packages (`cordis`, `schemastery`) keep their bare name
  // across the scope change and carry neither prefix.
  return `${toScope}/${bare}`
}

/**
 * The upstream name a package of this product answers to.
 * @param name - a package name as this product publishes it.
 * @returns the upstream name, or undefined when the package is from another scope.
 */
export function legacyNameFor(name: string): string | undefined {
  return rescope(name, PRODUCT_SCOPE, PRODUCT_PREFIX, PRODUCT_ENTRY, UPSTREAM_SCOPE, UPSTREAM_PREFIX, UPSTREAM_ENTRY)
}

/**
 * The package of this product that answers to an upstream name.
 *
 * The exact inverse of {@link legacyNameFor}, so a consumer can accept an
 * upstream request without carrying a second list that could disagree with it.
 * @param name - a package name as the upstream harness publishes it.
 * @returns this product's name, or undefined when the name is from another scope.
 */
export function productNameFor(name: string): string | undefined {
  return rescope(name, UPSTREAM_SCOPE, UPSTREAM_PREFIX, UPSTREAM_ENTRY, PRODUCT_SCOPE, PRODUCT_PREFIX, PRODUCT_ENTRY)
}
