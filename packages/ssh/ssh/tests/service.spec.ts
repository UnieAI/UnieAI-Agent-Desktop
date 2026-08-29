/**
 * The connection options the book puts on every `ssh` invocation.
 *
 * Multiplexing is the difference between a remote workspace that feels
 * local and one that pays a handshake per command, so what disables it is
 * as important as what enables it.
 */
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
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

describe('the configuration file the book reads', () => {
  it('is the one OpenSSH will open, not the one HOME names', () => {
    // OpenSSH expands `~` from the password database and ignores HOME. A book
    // that read HOME instead would list aliases the client cannot resolve, and
    // the connection would fail with "Could not resolve hostname <alias>".
    const original = process.env.HOME
    process.env.HOME = join(tmpdir(), 'not-the-passwd-home')
    try {
      expect(book().configPath).toBe(join(userInfo().homedir, '.ssh', 'config'))
    } finally {
      if (original === undefined) delete process.env.HOME
      else process.env.HOME = original
    }
  })

  it('is the configured file when one is named, which also steers every connection', () => {
    expect(book({ configPath: '/etc/rabi/ssh_config' }).configPath).toBe('/etc/rabi/ssh_config')
    expect(book({ configPath: '/etc/rabi/ssh_config' }).argvFor('build')).toContain('-F')
  })
})

describe('who is allowed to be asked for a password', () => {
  it('never lets a command prompt, because the terminal it would use is not one anybody is watching', () => {
    // Without this the client asks on inherited stdio: nowhere for an app
    // launched from a dock, and someone else's terminal for one launched from
    // a shell. The command then waits for a keystroke that never comes.
    expect(book().argvFor('build', 'exec true')).toContain('BatchMode=yes')
  })

  it('lets a real terminal session prompt, because the person is looking at that one', () => {
    expect(book().argvFor('build', undefined, { tty: true })).not.toContain('BatchMode=yes')
  })
})
