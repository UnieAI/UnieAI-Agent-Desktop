/**
 * What a terminal session records, and what it asks about itself later.
 *
 * These commands run on someone else's machine, so what they may use is a
 * contract — and they are shell text, which no type checks. A shell parses
 * each one here rather than a pattern matching it, after a defect that only
 * a parser would have caught.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  foregroundGroupCommand,
  groupMembersCommand,
  inputWaitingCommand,
  recordingSession,
  sessionTerminationLine,
  ttyFileExpression,
} from '../src/terminal.ts'

const EVERY_COMMAND = [
  foregroundGroupCommand('"$T"'),
  groupMembersCommand(4242),
  inputWaitingCommand(4242),
  sessionTerminationLine('"$P"', 'TERM'),
  recordingSession("exec 'sh' '-i'", '"$P"', '"$T"'),
]

describe('rules every session command follows', () => {
  it('parses as a shell script, checked by a shell', () => {
    for (const command of EVERY_COMMAND) {
      expect(() => execFileSync('sh', ['-n', '-c', command], { stdio: 'pipe' })).not.toThrow()
    }
  })

  it('never selects a process group with `ps -g`', () => {
    // `-g` selects by SESSION on Linux and by group name elsewhere; given a
    // process-group id it silently prints nothing, which reads as "the group
    // is empty" rather than as "you asked the wrong question".
    for (const command of EVERY_COMMAND) expect(command).not.toMatch(/ps [^|]*-g /)
  })
})

describe('what a session records before it becomes the shell', () => {
  it('records its pid and its terminal, in that order, before the exec', () => {
    const line = recordingSession("exec 'sh'", '"$P"', '"$T"')
    expect(line.indexOf('echo $$')).toBeLessThan(line.indexOf('tty >'))
    expect(line.indexOf('tty >')).toBeLessThan(line.indexOf('exec'))
  })

  it('survives a machine where naming the terminal fails', () => {
    // Only foreground inspection is lost; the session still runs.
    expect(recordingSession("exec 'sh'", '"$P"', '"$T"')).toContain('tty > "$T" 2>/dev/null')
  })

  it('keeps each session\'s files apart', () => {
    expect(ttyFileExpression('a')).not.toBe(ttyFileExpression('b'))
    expect(ttyFileExpression('a')).toContain('${TMPDIR:-/tmp}')
  })
})

describe('asking what is in the foreground', () => {
  it('reads the terminal\'s own foreground group, which follows every fg and pipeline', () => {
    expect(foregroundGroupCommand('"$T"')).toContain('ps -o tpgid=')
  })

  it('names the terminal the short way, as ps expects', () => {
    expect(foregroundGroupCommand('"$T"')).toContain('${t#/dev/}')
  })

  it('proves waiting from the kernel wait site, the strongest evidence a second session can read', () => {
    // /proc/<pid>/syscall needs ptrace-level access, which the default
    // kernel.yama.ptrace_scope=1 refuses across SSH sessions.
    const command = inputWaitingCommand(4242)
    expect(command).toContain('wchan')
    expect(command).toContain('wait_woken')
    expect(command).not.toContain('/syscall')
  })
})

describe('ending a session', () => {
  it('signals every member of the session, because a background job has its own group', () => {
    const line = sessionTerminationLine('"$P"', 'TERM')
    expect(line).toContain('ps -o sid=')
    expect(line).toContain('$1==s')
  })

  it('falls back to the group when the session cannot be read', () => {
    expect(sessionTerminationLine('"$P"', 'KILL')).toContain('kill -KILL -"$p"')
  })

  it('succeeds when the session is already gone', () => {
    expect(sessionTerminationLine('"$P"', 'TERM')).toContain('test -n "$p" || exit 0')
  })
})
