/**
 * The browser half spells the host's settings names by hand (a client bundle
 * may not import a node package). A test may import both, so the two spellings
 * are asserted equal here rather than left to drift silently — a renamed
 * namespace would otherwise make the machine memory write to nowhere.
 */
import { describe, expect, it } from 'vitest'
import { MACHINES_SETTINGS_NAMESPACE as HOST_NAMESPACE, MachineSettingsSchema } from '@unieai/uad-machines'
import { MACHINES_SETTINGS_NAMESPACE, WORKSPACE_BY_MACHINE_FIELD } from '../src/machine-settings.ts'

describe('machine settings names', () => {
  it('names the same namespace the host service registers', () => {
    expect(MACHINES_SETTINGS_NAMESPACE).toBe(HOST_NAMESPACE)
  })

  it('names a field the host schema actually declares', () => {
    expect(Object.keys(MachineSettingsSchema.dict ?? {})).toContain(WORKSPACE_BY_MACHINE_FIELD)
  })
})
