/**
 * The connection options the book puts on every `ssh` invocation.
 *
 * Multiplexing is the difference between a remote workspace that feels
 * local and one that pays a handshake per command, so what disables it is
 * as important as what enables it.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '../src/index.ts'

function book(config: ConstructorParameters<typeof SshHosts>[1] = {}): SshHosts {
  return new SshHosts(new Context(), config)
}

describe('the ssh argv', () => {
  it('asks for multiplexing, so the second command skips the handshake', () => {
    const argv = book().argvFor('build', "exec 'pwd'")
    expect(argv[0]).toBe('ssh')
    expect(argv).toContain('ControlMaster=auto')
    expect(argv.some(part => part.startsWith('ControlPersist='))).toBe(true)
  })

  it('puts the command after the alias, separated so it cannot read as an option', () => {
    const argv = book().argvFor('build', "exec 'pwd'")
    expect(argv.slice(-3)).toEqual(['build', '--', "exec 'pwd'"])
  })

  it('allocates no terminal by default, because a tty folds stderr into stdout', () => {
    expect(book().argvFor('build', 'exec true')).toContain('-T')
  })

  it('allocates one when asked, which is what a terminal session needs', () => {
    const argv = book().argvFor('build', undefined, { tty: true })
    expect(argv).toContain('-tt')
    expect(argv).not.toContain('-T')
  })

  it('omits the command entirely for a login session', () => {
    expect(book().argvFor('build', undefined, { tty: true })).not.toContain('--')
  })

  it('honors a configured client, so a deployment can name its own', () => {
    expect(book({ sshCommand: '/opt/bin/ssh' }).argvFor('build')[0]).toBe('/opt/bin/ssh')
  })
})

describe('the multiplexing socket', () => {
  it('is disabled by a zero persist window, which is the honest setting for a host that forbids it', () => {
    expect(book({ controlPersistSeconds: 0 }).controlPath()).toBeUndefined()
    expect(book({ controlPersistSeconds: 0 }).argvFor('build')).not.toContain('ControlMaster=auto')
  })

  it('is measured after %C expands, not as written', () => {
    // OpenSSH substitutes a 40-character digest for %C and then refuses the
    // whole connection — not just multiplexing — when the bound path exceeds
    // the platform's sun_path. Measuring the template would pass a path that
    // fails at connect time with "ControlPath too long".
    const path = book().controlPath()
    if (path !== undefined) expect(path.length - 2 + 40).toBeLessThanOrEqual(100)
  })
})
