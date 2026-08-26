/**
 * The command string that crosses to the remote login shell.
 *
 * Every rule here was learned from a shell that rejected the alternative,
 * and each test names the shell that taught it: the remote end is whatever
 * login shell the person has, so a form that works in bash is not a form
 * that works.
 */
import { describe, expect, it } from 'vitest'
import { quoteShellArg, remoteCommandLine } from '../src/index.ts'

describe('quoting one argument', () => {
  it('keeps a value that contains a quote', () => {
    // Closing the quoted run, escaping the quote, reopening: the only way a
    // single quote survives inside single quotes.
    expect(quoteShellArg("it's set")).toBe("'it'\"'\"'s set'")
  })

  it('neutralizes expansion, which is the whole point of crossing a shell', () => {
    expect(quoteShellArg('$HOME `id` $(pwd)')).toBe("'$HOME `id` $(pwd)'")
  })
})

describe('composing the remote command', () => {
  it('execs, so no wrapper process stands between the connection and the command', () => {
    expect(remoteCommandLine(['pwd'], undefined)).toBe("exec 'pwd'")
  })

  it('fails the command when its directory is missing rather than running it elsewhere', () => {
    expect(remoteCommandLine(['pwd'], '/w')).toBe("cd '/w' || exit 127; exec 'pwd'")
  })

  it('passes environment as an assignment prefix, not through `env A=b -- cmd`', () => {
    // POSIX `env` takes `--` only before the assignments; the `--` form dies
    // on a standard env with `'--': No such file or directory`.
    expect(remoteCommandLine(['sh'], undefined, { A: "it's" })).toBe("A='it'\"'\"'s' exec 'sh'")
  })

  it('sends no `--` before the command, because dash rejects `exec --`', () => {
    // bash accepts `exec -- cmd`; dash answers `exec: --: not found`, and the
    // remote shell is the person's, not one we chose.
    expect(remoteCommandLine(['ls', '-la'], undefined)).not.toContain('exec --')
  })

  it('refuses a command name that would read as an option, having no way to mark them off', () => {
    expect(() => remoteCommandLine(['-rf', '/'], undefined)).toThrow(/cannot begin with/)
  })

  it('refuses an empty command instead of sending a bare `exec`', () => {
    // `exec` alone would replace the login shell and hold the connection open.
    expect(() => remoteCommandLine([], undefined)).toThrow(/at least an executable/)
  })
})
