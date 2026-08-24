/**
 * The file name at the end of a path.
 *
 * What remains of the artifact list. That list answered "what came out of this
 * conversation" with bare file names; the Review tab answers it with the
 * change in each file and carries the way into the originating call, which was
 * the list's only other job — so the list went, and this one helper stayed
 * because a review row still has a path to shorten.
 */

/**
 * The last segment of a path, for a row that shows a name rather than a path.
 * @param path - the path the call named.
 * @returns the last segment, or the whole path when it has no separator.
 */
export function fileName(path: string): string {
  const parts = path.split(/[\\/]/u).filter(part => part !== '')
  return parts[parts.length - 1] ?? path
}
