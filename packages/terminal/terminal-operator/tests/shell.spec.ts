/** Shell resolution and the environment an operator terminal starts with. */
import { describe, expect, it } from 'vitest'
import { operatorTerminalEnv, resolveOperatorShell } from '../src/shell.ts'

/**
 * @param present - absolute paths that exist and are executable.
 * @returns a probe answering only for those.
 */
function probe(...present: string[]): (path: string) => boolean {
  return path => present.includes(path)
}

describe('resolveOperatorShell', () => {
  it("prefers the user's own login shell", () => {
    expect(resolveOperatorShell({ SHELL: '/usr/bin/zsh' }, probe('/usr/bin/zsh', '/bin/bash')))
      .toBe('/usr/bin/zsh')
  })

  it('ignores a SHELL that names nothing runnable', () => {
    expect(resolveOperatorShell({ SHELL: '/opt/removed/fish' }, probe('/bin/bash'))).toBe('/bin/bash')
  })

  it('ignores a relative SHELL rather than searching PATH for it', () => {
    // A PATH search here runs under the app's PATH, which is not necessarily
    // the one the user's login shell was found on; a same-named different
    // binary is worse than the documented fallback.
    expect(resolveOperatorShell({ SHELL: 'zsh' }, probe('/bin/bash'))).toBe('/bin/bash')
  })

  it('falls back through bash to sh', () => {
    expect(resolveOperatorShell({}, probe('/bin/bash', '/bin/sh'))).toBe('/bin/bash')
    expect(resolveOperatorShell({}, probe('/bin/sh'))).toBe('/bin/sh')
  })

  it('reports that nothing is runnable rather than guessing', () => {
    expect(resolveOperatorShell({ SHELL: '/bin/zsh' }, probe())).toBeUndefined()
  })
})

describe('operatorTerminalEnv', () => {
  it('declares a terminal the shipped renderer can actually drive', () => {
    const env = operatorTerminalEnv({ PATH: '/usr/bin', TERM: 'dumb' })
    expect(env['TERM']).toBe('xterm-256color')
    expect(env['COLORTERM']).toBe('truecolor')
    expect(env['PATH']).toBe('/usr/bin')
  })

  it('drops unset variables rather than passing them as the string "undefined"', () => {
    expect(operatorTerminalEnv({ HOME: '/home/u', EMPTY: undefined })).toEqual({
      HOME: '/home/u',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    })
  })
})
