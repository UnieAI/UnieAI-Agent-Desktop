/**
 * What an alias resolves to, read from OpenSSH's own answer.
 *
 * The fixtures are real `ssh -G` output: keywords lowercased, one per line,
 * repeated where a directive may appear more than once.
 */
import { describe, expect, it } from 'vitest'
import { parseEffectiveConfig, resolvedHostOf } from '../src/resolve.ts'

/** Trimmed `ssh -G build` output from an OpenSSH client. */
const EFFECTIVE = [
  'user dev',
  'hostname 10.0.0.2',
  'port 2222',
  'proxyjump bastion,inner',
  'identityfile ~/.ssh/id_ed25519',
  'identityfile ~/.ssh/id_rsa',
  'forwardagent no',
  'loglevel INFO',
].join('\n')

describe('parsing the effective configuration', () => {
  it('keeps every value of a keyword that may repeat', () => {
    const table = parseEffectiveConfig(EFFECTIVE)
    expect(table.get('identityfile')).toEqual(['~/.ssh/id_ed25519', '~/.ssh/id_rsa'])
  })

  it('keeps a keyword with no value, which is how OpenSSH prints an empty setting', () => {
    expect(parseEffectiveConfig('proxycommand\nuser dev').get('proxycommand')).toEqual([''])
  })
})

describe('reading the fields a surface shows', () => {
  it('reports where a connection actually goes', () => {
    const host = resolvedHostOf('build', parseEffectiveConfig(EFFECTIVE))
    expect(host).toMatchObject({ alias: 'build', hostName: '10.0.0.2', user: 'dev', port: 2222 })
  })

  it('lists jump hosts in the order they are traversed', () => {
    expect(resolvedHostOf('build', parseEffectiveConfig(EFFECTIVE)).proxyJump).toEqual(['bastion', 'inner'])
  })

  it('reports a direct connection as no jump, including the literal `none`', () => {
    expect(resolvedHostOf('b', parseEffectiveConfig('proxyjump none')).proxyJump).toEqual([])
    expect(resolvedHostOf('b', parseEffectiveConfig('user dev')).proxyJump).toEqual([])
  })

  it('falls back to the alias when no HostName applies, as ssh does', () => {
    expect(resolvedHostOf('example.org', parseEffectiveConfig('user dev')).hostName).toBe('example.org')
  })

  it('treats a missing port as the protocol default rather than port zero', () => {
    expect(resolvedHostOf('b', parseEffectiveConfig('user dev')).port).toBe(22)
  })
})
