/**
 * Remote process lifetime.
 *
 * A remote command outlives the connection that started it. Measured against
 * a real server: killing the local client leaves the remote command running,
 * with a terminal allocated and without one, and a command that ignores
 * SIGHUP survives either way. The connection is therefore not a handle on
 * the process, and something has to be.
 *
 * What this module adds is the smallest thing that can be: the remote shell
 * records its own pid before becoming the command, and termination is a
 * second connection that signals that pid's PROCESS GROUP. The group is what
 * makes it a tree kill — under sshd the command shell is its own group
 * leader (verified: `ps -o pgid=` equals the recorded pid), so one signal
 * reaches the command and everything it started.
 */

/** Where a remote run keeps its pid, and how it is cleaned up. */
export interface RemoteRun {
  /** Shell expression for the pid file path, evaluated on the remote. */
  pidFile: string
  /** The command line to send, which records the pid and then execs. */
  line: string
}

/**
 * Name one run's pid file in the remote temporary directory.
 *
 * `${TMPDIR:-/tmp}` is left for the remote shell to expand: the harness
 * cannot know where a machine puts temporary files, and a hardcoded `/tmp`
 * would fail on a host that mounts it read-only or per-service.
 * @param id - a unique run id.
 * @returns a shell expression that expands to the pid file path.
 */
export function pidFileExpression(id: string): string {
  return `"\${TMPDIR:-/tmp}/dsh-ssh-${id}.pid"`
}

/**
 * Wrap a remote command line so the run can be terminated later.
 *
 * The pid is recorded BEFORE the exec and by the same shell that execs, so
 * the recorded pid is the command's own — `exec` replaces the shell without
 * changing its pid. Recording after the exec would be unreachable code, and
 * recording from a subshell would name a process that is already gone.
 * @param line - the composed remote command line, ending in `exec`.
 * @param pidFile - shell expression naming the pid file.
 * @returns the line to send.
 */
export function recordingPid(line: string, pidFile: string): string {
  return `echo $$ > ${pidFile}; ${line}`
}

/**
 * The remote command that ends one run.
 *
 * Signals the process GROUP first and falls back to the single pid: a remote
 * without a group leader — one whose `sh` was not made a session leader by
 * its sshd — still gets the command itself. A missing pid file means the
 * run never started or has already been cleaned up, which is success for a
 * caller asking for it to be gone.
 * @param pidFile - shell expression naming the pid file.
 * @param signal - the signal name, without the `SIG` prefix.
 * @returns a command line for the remote shell.
 */
export function terminationLine(pidFile: string, signal: 'TERM' | 'KILL'): string {
  return [
    `p=$(cat ${pidFile} 2>/dev/null)`,
    'test -n "$p" || exit 0',
    `kill -${signal} -"$p" 2>/dev/null || kill -${signal} "$p" 2>/dev/null`,
    'exit 0',
  ].join('; ')
}

/**
 * The remote command that removes one run's pid file.
 * @param pidFile - shell expression naming the pid file.
 * @returns a command line for the remote shell.
 */
export function cleanupLine(pidFile: string): string {
  return `rm -f ${pidFile}`
}
