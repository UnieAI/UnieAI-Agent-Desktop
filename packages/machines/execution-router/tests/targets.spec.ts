/**
 * Which machine a call belongs to.
 *
 * The rule is small and load-bearing: a call that names a target reads its
 * machine from the target, so a file resolved before a person switched
 * machines still reads from the machine it came from rather than silently
 * becoming a different file with the same path.
 */
import { describe, expect, it } from 'vitest'
import { machineOfTarget } from '../src/targets.ts'

describe('reading the machine out of a target', () => {
  it('takes the alias a remote provider stamped on its key', () => {
    expect(machineOfTarget('ssh:build-box:/srv/app/main.ts')).toBe('build-box')
  })

  it('reads a key with no machine in it as this computer', () => {
    // The local provider's key is the path itself.
    expect(machineOfTarget('/home/dev/main.ts')).toBe('local')
    expect(machineOfTarget('C:\\src\\main.ts')).toBe('local')
  })

  it('stops at the first separator, so a path with colons stays intact', () => {
    expect(machineOfTarget('ssh:gpu:/data/2026:07:28/run.log')).toBe('gpu')
  })

  it('does not mistake a path that merely starts with the word', () => {
    expect(machineOfTarget('/etc/ssh/sshd_config')).toBe('local')
  })
})
