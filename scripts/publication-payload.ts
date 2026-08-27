/** Publication payload policy shared by static manifests and packed tarballs. */

/**
 * Whether a package manifest exports generated Host-for-Client metadata.
 * @param manifest - parsed package manifest to inspect.
 * @returns whether the canonical `./remote` export pair is present.
 */
export function hasTypertRemoteNavigation(manifest: unknown): boolean {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return false
  const exportsField = (manifest as Record<string, unknown>).exports
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return false
  const remote = (exportsField as Record<string, unknown>)['./remote']
  if (remote === null || typeof remote !== 'object' || Array.isArray(remote)) return false
  const entry = remote as Record<string, unknown>
  return entry.types === './lib/typert.remote-client.d.ts'
    && entry.default === './lib/typert.remote-client.js'
}

/** Normalize a package manifest path or npm tarball member to its payload-relative path. */
function payloadPath(file: string): string {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
  return normalized.startsWith('package/') ? normalized.slice('package/'.length) : normalized
}

/**
 * Legal notices that accompany vendored code. A copy of someone else's work
 * carries its licence text, and the copy that ships is the compiled `lib/`
 * output — so the notice sitting beside the vendored source is the one that has
 * to travel with it. Basenames are matched exactly, so `src/LICENSE.ts` is
 * still source.
 */
const LICENCE_FILE = /^(LICENSE|LICENCE|COPYING|NOTICE)(\.(md|txt))?$/

/**
 * Whether a package payload path exposes source or map intermediates. Maps
 * serve editor navigation during development, where a workspace consumer
 * resolves their source through the package link; a published map resolves
 * nothing, so no payload publishes one.
 *
 * A licence file under `src/` is neither: it is the notice a vendored
 * component's licence requires the distribution to carry, npm force-includes
 * such files anyway, and `@unieai/uad-client-ui-primitives` declares exactly
 * that in its `files`. Rejecting it made the whole dsh family unpackable —
 * which is why 0.1.9 through 0.1.12 were tagged and never reached the registry.
 * @param file - manifest path or tarball member to classify.
 * @returns whether publishing this path is forbidden.
 */
export function isForbiddenPublicationFile(file: string): boolean {
  const normalized = payloadPath(file)
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
  if (LICENCE_FILE.test(basename)) return false
  return normalized === 'src'
    || normalized.startsWith('src/')
    || normalized.endsWith('.d.ts.map')
    || normalized.endsWith('.js.map')
}

/**
 * Reject source and map members in a packed npm tarball.
 * @param files - tarball members to validate.
 * @param context - tarball identity named in the failure.
 */
export function validateTarballPayload(files: readonly string[], context: string): void {
  for (const file of files) {
    if (!isForbiddenPublicationFile(file)) continue
    const normalized = payloadPath(file)
    if (normalized === 'src' || normalized.startsWith('src/')) {
      throw new Error(`${context} publishes source file ${file}`)
    }
    throw new Error(`${context} publishes source map ${file}`)
  }
}
