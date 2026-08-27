/**
 * The shell text every filesystem question crosses as.
 *
 * These commands run on someone else's machine, under a userland this
 * repository does not choose, so what they may and may not use is a real
 * contract — and it is shell text, which no type can check.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { quoteShellArg } from '@unieai/uad-ssh'
import {
  atomicWriteCommand,
  canonicalizeCommand,
  listCommand,
  readCommand,
  statCommand,
  STAT_DIALECT_PROBE,
} from '../src/shell.ts'

/** Every command this module composes, for the rules that apply to all of them. */
const EVERY_COMMAND = [
  canonicalizeCommand('a.txt', '/w'),
  statCommand('/w/a.txt', 'gnu', true),
  statCommand('/w/a.txt', 'bsd', false),
  listCommand('/w', 'gnu'),
  atomicWriteCommand('/w/a.txt', 'gnu'),
  readCommand('/w/a.txt'),
]

describe('rules every command follows', () => {
  it('parses as a shell script, checked by a shell rather than by a pattern', () => {
    // A `;` ending one composed fragment plus the `; ` joiner produced `;;`
    // where no `case` arm was ending, and bash answered `syntax error near
    // unexpected token ';;'`. Only a parser catches that reliably, so this
    // asks one: `sh -n` reads the script without running any of it.
    for (const command of EVERY_COMMAND) {
      expect(() => execFileSync('sh', ['-n', '-c', command], { stdio: 'pipe' })).not.toThrow()
    }
  })

  it('uses no GNU-only tools, because the machine may carry a BSD userland', () => {
    for (const command of EVERY_COMMAND) {
      expect(command).not.toContain('realpath')
      expect(command).not.toContain('readlink -f')
      expect(command).not.toContain('--reference')
      expect(command).not.toContain('-printf')
      expect(command).not.toContain('maxdepth')
    }
  })

  it('quotes a path that tries to end the quoting and run something else', () => {
    const hostile = "/w/'; rm -rf /; echo '"
    // The payload survives as DATA — inside the quoted word — rather than
    // becoming a second command.
    expect(readCommand(hostile)).toContain(quoteShellArg(hostile))
    for (const command of [canonicalizeCommand(hostile, '/w'), readCommand(hostile), atomicWriteCommand(hostile, 'gnu')]) {
      expect(() => execFileSync('sh', ['-n', '-c', command], { stdio: 'pipe' })).not.toThrow()
    }
  })
})

describe('finding out which stat the machine speaks', () => {
  it('tries both dialects and reports neither when neither answers', () => {
    expect(STAT_DIALECT_PROBE).toContain('stat -c %s')
    expect(STAT_DIALECT_PROBE).toContain('stat -f %z')
    expect(STAT_DIALECT_PROBE).toContain('printf none')
  })

  it('asks each dialect in its own spelling', () => {
    expect(statCommand('/f', 'gnu', true)).toContain("stat -L -c '%s %Y'")
    expect(statCommand('/f', 'bsd', true)).toContain("stat -L -f '%z %m'")
  })

  it('follows a final symlink only when asked, which is what separates stat from lstat', () => {
    expect(statCommand('/f', 'gnu', true)).toContain('stat -L')
    expect(statCommand('/f', 'gnu', false)).not.toContain('stat -L')
    expect(statCommand('/f', 'gnu', false)).toContain('t=symlink')
    expect(statCommand('/f', 'gnu', true)).not.toContain('t=symlink')
  })
})

describe('canonicalizing', () => {
  it('resolves symlinks physically with pwd -P, which every POSIX shell has', () => {
    expect(canonicalizeCommand('a', '/w')).toContain('pwd -P')
  })

  it('names a path that does not exist yet, because a write has to', () => {
    // The parent is entered and the basename appended, so creating a file
    // can resolve its destination first.
    const command = canonicalizeCommand('new.txt', '/w')
    expect(command).toContain('dirname')
    expect(command).toContain('basename')
  })
})

describe('listing', () => {
  it('terminates names with NUL, the one byte a filename cannot contain', () => {
    expect(listCommand('/w', 'gnu')).toContain('\\000')
  })

  it('enumerates dotfiles, which a bare glob would miss', () => {
    expect(listCommand('/w', 'gnu')).toContain('.[!.]*')
  })
})

describe('writing', () => {
  it('stages beside the target, because mv is only atomic within one filesystem', () => {
    const command = atomicWriteCommand('/w/a.txt', 'gnu')
    expect(command).toContain('d=$(dirname')
    expect(command).toContain('t="$d/.dsh-ssh-write.$$"')
    expect(command).toContain('mv -f "$t"')
  })

  it('removes the staging file when the transfer fails, leaving the original intact', () => {
    expect(atomicWriteCommand('/w/a.txt', 'gnu')).toContain('rm -f "$t"')
  })

  it('carries an existing file\'s mode across, in the machine\'s own stat dialect', () => {
    expect(atomicWriteCommand('/w/a.txt', 'gnu')).toContain('stat -c %a')
    expect(atomicWriteCommand('/w/a.txt', 'bsd')).toContain('stat -f %Lp')
  })
})

describe('reading', () => {
  it('refuses anything that is not a regular file before streaming a byte', () => {
    expect(readCommand('/w/a.txt')).toMatch(/^\[ -f .* \] \|\| exit 1/)
  })
})
