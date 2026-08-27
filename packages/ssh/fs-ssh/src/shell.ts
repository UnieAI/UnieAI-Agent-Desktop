/**
 * What the harness asks a remote machine about its files.
 *
 * Every question here is a POSIX shell command, because that is the one
 * interface every machine with an `sshd` already exposes. Two portability
 * facts shape all of it:
 *
 * `stat` has two incompatible dialects — GNU/busybox `stat -c '%s %Y'` and
 * BSD/macOS `stat -f '%z %m'` — and a machine answers to exactly one. The
 * provider probes once per connection and remembers, rather than guessing
 * from `uname` (a Linux box can carry BSD tools, and a Mac can carry GNU
 * ones through Homebrew).
 *
 * Canonicalization uses `cd` and `pwd -P`, not `realpath` or `readlink -f`:
 * those are absent or differently spelled across the same divide, while
 * `pwd -P` is POSIX and resolves symlinks physically. It also works for a
 * path that does not exist yet, which every file creation needs.
 */

import { quoteShellArg } from '@unieai/uad-ssh'

/** Which `stat` a machine speaks. */
export type StatDialect = 'gnu' | 'bsd'

/** The one command that decides it. */
export const STAT_DIALECT_PROBE =
  'if stat -c %s . >/dev/null 2>&1; then printf gnu; elif stat -f %z . >/dev/null 2>&1; then printf bsd; else printf none; fi'

/**
 * Canonicalize a path in the remote filesystem.
 *
 * A directory is entered and reported; anything else is reported as its
 * canonical parent plus its own name, so a file that does not exist yet still
 * canonicalizes — resolving a path is how a write names its destination.
 * @param path - the path to canonicalize; relative paths resolve against `cwd`.
 * @param cwd - directory relative paths resolve against.
 * @returns a remote command printing the canonical absolute path, or nothing when the parent is unreachable.
 */
export function canonicalizeCommand(path: string, cwd: string): string {
  const p = quoteShellArg(path)
  return [
    `cd ${quoteShellArg(cwd)} 2>/dev/null || exit 3`,
    `p=${p}`,
    'if [ -d "$p" ]; then cd "$p" 2>/dev/null || exit 4; pwd -P',
    'else d=$(dirname "$p"); b=$(basename "$p"); cd "$d" 2>/dev/null || exit 4',
    'r=$(pwd -P); case "$r" in */) printf %s%s "$r" "$b";; *) printf %s/%s "$r" "$b";; esac; fi',
  ].join('; ')
}

/**
 * Read one path's metadata without following a final symlink.
 *
 * The three fields are printed on one line in a fixed order — type, size,
 * modification time — so one round trip answers what `stat`, `lstat` and the
 * version token all need. The type comes from shell tests rather than from
 * `stat`'s mode bits, whose formats differ between the dialects in ways the
 * size and time fields do not.
 * @param path - absolute remote path.
 * @param dialect - which `stat` the machine speaks.
 * @param follow - resolve a final symlink before reporting.
 * @returns a remote command printing `type size mtime`, or exiting 1 when the path is absent.
 */
export function statCommand(path: string, dialect: StatDialect, follow: boolean): string {
  const p = quoteShellArg(path)
  const exists = follow ? `[ -e ${p} ]` : `[ -e ${p} ] || [ -L ${p} ]`
  const kind = follow
    ? `if [ -d ${p} ]; then t=directory; elif [ -f ${p} ]; then t=file; else t=other; fi`
    : `if [ -L ${p} ]; then t=symlink; elif [ -d ${p} ]; then t=directory; elif [ -f ${p} ]; then t=file; else t=other; fi`
  const stat = dialect === 'gnu'
    ? `stat ${follow ? '-L ' : ''}-c '%s %Y' ${p}`
    : `stat ${follow ? '-L ' : ''}-f '%z %m' ${p}`
  return `${exists} || exit 1; ${kind}; printf '%s ' "$t"; ${stat}`
}

/**
 * List a directory's direct children with the metadata a listing shows.
 *
 * One command, not one per child: a directory of two hundred files would
 * otherwise be two hundred round trips, and on a connection with 30 ms of
 * latency that is six seconds to open a folder.
 *
 * Names are NUL-terminated because a filename may contain anything except NUL
 * — including the newline that a line-oriented listing would split on.
 * @param path - absolute remote directory path.
 * @param dialect - which `stat` the machine speaks.
 * @returns a remote command printing `type size mtime name` records, NUL-terminated.
 */
export function listCommand(path: string, dialect: StatDialect): string {
  const p = quoteShellArg(path)
  const stat = dialect === 'gnu' ? 'stat -c \'%s %Y\' "$e"' : 'stat -f \'%z %m\' "$e"'
  return [
    `cd ${p} 2>/dev/null || exit 3`,
    // `find -maxdepth` is GNU-only and `ls` output cannot be parsed safely, so
    // the shell's own globbing enumerates; the two patterns cover dotfiles,
    // and an unmatched pattern is skipped rather than passed through.
    'for e in * .[!.]* ..?*; do [ -e "$e" ] || [ -L "$e" ] || continue',
    'if [ -d "$e" ]; then t=directory; elif [ -f "$e" ]; then t=file; else t=other; fi',
    `printf '%s ' "$t"; ${stat} | tr -d '\\n'; printf ' %s\\000' "$e"; done`,
  ].join('; ')
}

/**
 * Replace a file's contents with what arrives on standard input.
 *
 * The staging file is created in the TARGET's directory: `mv` is only atomic
 * within one filesystem, and a temporary directory elsewhere would silently
 * degrade to a copy that a reader can observe half-written.
 *
 * `cat` writes the staging file rather than the destination, so an
 * interrupted transfer leaves the original intact.
 *
 * An existing file's permissions are carried across — `chmod --reference` is
 * GNU-only, so the mode is read with the machine's own `stat` dialect and
 * applied — because a rewritten script that stops being executable, or a
 * rewritten key that becomes world-readable, is a worse outcome than a
 * failed write.
 * @param path - absolute remote path to publish.
 * @param dialect - which `stat` the machine speaks.
 * @returns a remote command consuming stdin and publishing it atomically.
 */
export function atomicWriteCommand(path: string, dialect: StatDialect): string {
  const p = quoteShellArg(path)
  const mode = dialect === 'gnu' ? `stat -c %a ${p}` : `stat -f %Lp ${p}`
  return [
    `d=$(dirname ${p})`,
    't="$d/.dsh-ssh-write.$$"',
    'cat > "$t" || { rm -f "$t"; exit 5; }',
    `if [ -e ${p} ]; then m=$(${mode} 2>/dev/null); [ -n "$m" ] && chmod "$m" "$t" 2>/dev/null; fi`,
    `mv -f "$t" ${p} || { rm -f "$t"; exit 6; }`,
  ].join('; ')
}

/**
 * Read a file's bytes.
 * @param path - absolute remote path.
 * @returns a remote command streaming the file to stdout.
 */
export function readCommand(path: string): string {
  const p = quoteShellArg(path)
  return `[ -f ${p} ] || exit 1; exec cat ${p}`
}

/**
 * Create one directory under an existing parent.
 *
 * Non-recursive (`mkdir` without `-p`), because the parent is a directory the
 * caller is already looking at: a missing parent is a real failure, and `-p`
 * would silently invent the whole chain. The two failures a caller must tell
 * apart get their own exit codes, since `mkdir` reports both as 1 and its
 * message is the machine's locale rather than something to parse.
 * @param parent - absolute remote directory the new one goes inside.
 * @param name - one path segment, quoted here.
 * @returns a remote command exiting 0 on success, 3 when something is already
 * there, 4 when the parent is missing, and 1 for anything else.
 */
export function makeDirectoryCommand(parent: string, name: string): string {
  const target = quoteShellArg(`${parent.replace(/\/+$/u, '')}/${name}`)
  return [
    `if [ -e ${target} ]; then exit 3; fi`,
    `if [ ! -d ${quoteShellArg(parent)} ]; then exit 4; fi`,
    `mkdir ${target}`,
  ].join('\n')
}
