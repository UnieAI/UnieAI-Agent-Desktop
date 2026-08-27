/**
 * Which machine one call belongs to.
 *
 * Two different questions hide behind that. A call that names a TARGET —
 * reading a file, listing a directory — already carries its machine: a
 * filesystem target key from a remote provider is prefixed with the machine
 * it came from, so the answer is in the argument and cannot drift. A call
 * that names a PATH or nothing at all — spawning a command, resolving a
 * relative path — belongs to whichever machine the person is working on,
 * which only the machine list knows.
 *
 * Reading it from the argument wherever possible is what keeps a target
 * usable after the person switches machines: a file read handed out before
 * the switch still reads from the machine it was resolved on, rather than
 * silently becoming a different file with the same path.
 */

import { LOCAL_MACHINE } from '@unieai/uad-machines'

/** Prefix a remote filesystem target key carries. */
const SSH_TARGET = /^ssh:([^:]+):/

/**
 * The machine a filesystem target belongs to.
 * @param targetKey - the opaque key from a resolved target.
 * @returns the target id; `local` for a key with no machine in it.
 */
export function machineOfTarget(targetKey: string): string {
  return SSH_TARGET.exec(targetKey)?.[1] ?? LOCAL_MACHINE
}
