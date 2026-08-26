/**
 * How a run is made terminable.
 *
 * The remote side keeps exactly one piece of state — a pid file — and these
 * tests pin what is written into it and what reads it back, because both
 * halves are shell text that no type can check.
 */
import { describe, expect, it } from 'vitest'
import { cleanupLine, pidFileExpression, recordingPid, terminationLine } from '../src/remote-process.ts'

describe('naming the pid file', () => {
  it('lets the remote shell choose the temporary directory', () => {
    // A hardcoded /tmp fails on a host that mounts it read-only or per-service.
    expect(pidFileExpression('abc')).toBe('"${TMPDIR:-/tmp}/dsh-ssh-abc.pid"')
  })
})

describe('recording the pid', () => {
  it('records before the exec, from the shell that becomes the command', () => {
    // `exec` keeps the pid, so the recorded number is the command's own.
    const line = recordingPid("exec 'sleep' '5'", '"$T"')
    expect(line).toBe('echo $$ > "$T"; exec \'sleep\' \'5\'')
    expect(line.indexOf('echo $$')).toBeLessThan(line.indexOf('exec'))
  })
})

describe('ending a run', () => {
  it('signals the process group, so the command\'s own children go too', () => {
    expect(terminationLine('"$T"', 'TERM')).toContain('kill -TERM -"$p"')
  })

  it('falls back to the single pid where there is no group to signal', () => {
    const line = terminationLine('"$T"', 'TERM')
    expect(line).toContain('|| kill -TERM "$p"')
  })

  it('escalates with the same shape, because a KILL must not need new code', () => {
    expect(terminationLine('"$T"', 'KILL')).toContain('kill -KILL -"$p"')
  })

  it('succeeds when the pid file is gone, which is what the caller asked for', () => {
    // Never started, or already cleaned up: either way the run is not running.
    const line = terminationLine('"$T"', 'TERM')
    expect(line).toContain('test -n "$p" || exit 0')
  })

  it('removes the only trace a run leaves on the machine', () => {
    expect(cleanupLine('"$T"')).toBe('rm -f "$T"')
  })
})
