/**
 * Avatar fallback shared by the two places an identity is drawn: the Account
 * section's profile card and the sidebar's account row.
 */
import type { UnieAiAccountIdentity } from '../account-contract.ts'

/**
 * One display character for an account with no avatar: the first character of
 * the name, or of the address when the name is blank. Code-point aware, so an
 * emoji or a CJK character is not split.
 * @param identity - the signed-in identity.
 * @returns one display character, or an empty string when both fields are blank.
 */
export function monogram(identity: Pick<UnieAiAccountIdentity, 'displayName' | 'email'>): string {
  const source = identity.displayName.trim() === '' ? identity.email.trim() : identity.displayName.trim()
  // codePointAt, not source[0]: an astral first character (an emoji name)
  // would otherwise be cut in half into a lone surrogate.
  const first = source.codePointAt(0)
  return first === undefined ? '' : String.fromCodePoint(first).toUpperCase()
}
