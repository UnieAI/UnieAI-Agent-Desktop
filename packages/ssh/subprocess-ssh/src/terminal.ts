/**
 * A terminal on the machine, and the remote facts a terminal consumer needs
 * about it.
 *
 * The local half is an ordinary PTY running `ssh -tt`, which is what carries
 * bytes, window size and the session's lifetime. What cannot be delegated is
 * every question ABOUT the terminal: the local PTY's foreground process is
 * always `ssh`, so a consumer asking what is running would be told `ssh` no
 * matter what the person is doing, and a signal aimed at the foreground
 * group would hit the client instead of the command.
 *
 * Those questions are therefore asked on the machine, over a second
 * multiplexed connection, using two facts the session's wrapper recorded
 * before it became the shell: its own pid, and its terminal.
 */

import { setTimeout as sleepMs } from 'node:timers/promises'
import type { Readable } from 'node:stream'
import type {
  SubprocessOutcome,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
} from '@unieai/uad-subprocess'

/** Runs one short command on the machine and returns its stdout. */
export type RemoteControl = (line: string) => Promise<string>

/**
 * Name the file one session records its terminal in.
 * @param id - the session's unique id.
 * @returns a shell expression that expands to the path.
 */
export function ttyFileExpression(id: string): string {
  return `"\${TMPDIR:-/tmp}/dsh-ssh-${id}.tty"`
}

/**
 * Wrap a session's command line so the machine records what a consumer will
 * need to ask about later.
 *
 * `tty` reports the terminal of standard input, which under `ssh -tt` is the
 * session's own PTY. Its failure is not fatal: a session whose terminal
 * cannot be named still runs, and only foreground inspection is lost.
 * @param line - the composed remote command line, ending in `exec`.
 * @param pidFile - shell expression naming the pid file.
 * @param ttyFile - shell expression naming the tty file.
 * @returns the line to send.
 */
export function recordingSession(line: string, pidFile: string, ttyFile: string): string {
  return `echo $$ > ${pidFile}; tty > ${ttyFile} 2>/dev/null; ${line}`
}

/**
 * Ask the machine which process group currently owns the terminal.
 *
 * `tpgid` is the kernel's own answer to "who is in the foreground", so it
 * follows every `fg`, pipeline and nested program without the harness
 * tracking any of it. The `/dev/` prefix is stripped because `ps -t` names a
 * terminal the short way.
 * @param ttyFile - shell expression naming the tty file.
 * @returns a remote command printing the foreground process-group id.
 */
export function foregroundGroupCommand(ttyFile: string): string {
  return [
    `t=$(cat ${ttyFile} 2>/dev/null)`,
    'test -n "$t" || exit 1',
    'ps -o tpgid= -t "${t#/dev/}" 2>/dev/null | tr -d " " | head -n1',
  ].join('; ')
}

/**
 * List the processes in one process group.
 *
 * Selected by filtering `ps -eo pgid=,pid=`, not with `ps -g`: that flag
 * selects by SESSION on Linux and by group name elsewhere, and it silently
 * returns nothing for a process-group id — which reads as "the group is
 * empty" rather than as "you asked the wrong question".
 * @param pgid - the process-group id.
 * @returns a remote command printing one pid per line.
 */
export function groupMembersCommand(pgid: number): string {
  return `ps -eo pgid=,pid= 2>/dev/null | awk -v g=${String(pgid)} '$1==g {print $2}'`
}

/**
 * Kernel wait sites that mean "blocked reading a terminal".
 *
 * Linux has named this differently across versions — `n_tty_read` and
 * `read_chan` historically, `wait_woken` on current kernels — and BSD calls
 * it `ttyin`. A name not on this list is not evidence of anything, which is
 * the honest answer for a machine whose kernel spells it another way.
 */
const TTY_READ_WAITS = ['n_tty_read', 'read_chan', 'wait_woken', 'ttyin']

/**
 * Ask the machine whether the foreground group is blocked reading its
 * terminal.
 *
 * The evidence is the kernel wait site (`wchan`) of the group's members. The
 * stronger proof — the blocked syscall and its file descriptor, which is
 * what the local provider reads — is unavailable here: `/proc/<pid>/syscall`
 * requires ptrace-level access, and a machine running the default
 * `kernel.yama.ptrace_scope=1` refuses it to a second SSH session with
 * `Operation not permitted`. `wchan` stays readable.
 *
 * Anywhere the wait site is unnamed or unrecognized this answers nothing,
 * which the seam allows: the field says whether the provider CAN PROVE the
 * group is waiting, and a guess dressed as proof would make a consumer's
 * readiness logic worse than no signal at all.
 * @param pgid - the foreground process-group id.
 * @returns a remote command printing `waiting` when it can prove it.
 */
export function inputWaitingCommand(pgid: number): string {
  const patterns = TTY_READ_WAITS.map(name => `*${name}*`).join('|')
  return [
    `for p in $(${groupMembersCommand(pgid)}); do`,
    '  w=$(cat /proc/"$p"/wchan 2>/dev/null)',
    '  test -n "$w" || w=$(ps -o wchan= -p "$p" 2>/dev/null)',
    `  case "$w" in ${patterns}) printf waiting; exit 0;; esac`,
    'done',
  ].join('\n')
}

/**
 * End every process in one terminal session on the machine.
 *
 * Session-scoped, not group-scoped, because job control is the whole point
 * of a terminal: `sleep 90 &` puts that command in its OWN process group
 * within the session, so signalling the shell's group leaves it running with
 * nothing left to observe it. The seam asks a terminal's termination to
 * reach every session member the provider can still see, and on a remote
 * machine that means enumerating the session and signalling each member —
 * POSIX has no "signal a session" call.
 * @param pidFile - shell expression naming the session's pid file.
 * @param signal - the signal name, without the `SIG` prefix.
 * @returns a remote command line.
 */
export function sessionTerminationLine(pidFile: string, signal: 'TERM' | 'KILL'): string {
  return [
    `p=$(cat ${pidFile} 2>/dev/null)`,
    'test -n "$p" || exit 0',
    's=$(ps -o sid= -p "$p" 2>/dev/null | tr -d " ")',
    'if [ -n "$s" ]; then',
    '  for m in $(ps -eo sid=,pid= 2>/dev/null | awk -v s="$s" \'$1==s {print $2}\'); do',
    `    kill -${signal} "$m" 2>/dev/null`,
    '  done',
    'else',
    `  kill -${signal} -"$p" 2>/dev/null || kill -${signal} "$p" 2>/dev/null`,
    'fi',
    'exit 0',
  ].join('\n')
}

/**
 * A terminal whose bytes are local and whose facts are remote.
 */
export class RemoteTerminalHandle implements SubprocessTerminalHandle {
  constructor(
    private readonly local: SubprocessTerminalHandle,
    private readonly control: RemoteControl,
    private readonly pidFile: string,
    private readonly ttyFile: string,
    private readonly graceMs: number,
  ) {}

  /** Top-level process id of the LOCAL client that carries this session. */
  get pid(): number {
    return this.local.pid
  }

  get output(): Readable {
    return this.local.output
  }

  get done(): Promise<SubprocessOutcome> {
    return this.local.done
  }

  write(data: string): Promise<void> {
    return this.local.write(data)
  }

  /**
   * Tell the terminal its window changed size.
   *
   * Delegated: resizing the local PTY makes the client send a window-change
   * message, and the remote terminal is resized by the machine's own sshd —
   * the same path a person's terminal emulator uses.
   * @param cols - column count.
   * @param rows - row count.
   */
  resize(cols: number, rows: number): Promise<void> {
    return this.local.resize(cols, rows)
  }

  /**
   * What is running in the foreground, on the machine.
   * @returns the remote foreground group, or undefined when the session cannot be inspected.
   */
  async inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    const answer = (await this.control(foregroundGroupCommand(this.ttyFile))).trim()
    const processGroupId = Number.parseInt(answer, 10)
    if (!Number.isInteger(processGroupId) || processGroupId <= 0) return undefined
    const waiting = (await this.control(inputWaitingCommand(processGroupId))).trim()
    return { processGroupId, inputWaiting: waiting === 'waiting' }
  }

  /**
   * Deliver a signal to the foreground group on the machine.
   *
   * The local PTY is deliberately not signalled: that would reach the `ssh`
   * client, ending the whole session where the person meant to interrupt one
   * command.
   * @param signal - the permitted terminal signal.
   * @returns the group id that received it.
   */
  async signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    const foreground = await this.inspectForeground()
    if (foreground === undefined) {
      throw new Error('subprocess-ssh: the remote terminal has no foreground group to signal')
    }
    const name = signal.replace(/^SIG/, '')
    await this.control(`kill -${name} -${String(foreground.processGroupId)} 2>/dev/null; exit 0`)
    return foreground.processGroupId
  }

  /**
   * End the session on both ends.
   *
   * The remote group is signalled first and the client is closed after: with
   * the connection already gone there is nothing left to carry a signal, and
   * a shell that ignores SIGHUP would keep the machine's work running with
   * nobody watching it.
   */
  async terminate(): Promise<void> {
    try {
      await this.control(sessionTerminationLine(this.pidFile, 'TERM'))
      await sleepMs(this.graceMs)
      await this.control(sessionTerminationLine(this.pidFile, 'KILL'))
    } catch {
      // The machine is unreachable, which ends the session as surely as a
      // signal would; the local half below still has to be cleaned up.
    }
    await this.local.terminate()
  }
}
