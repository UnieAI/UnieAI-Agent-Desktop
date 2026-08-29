// The lines the add dialog shows are the lines the writer appends. The rule
// they exist to make visible: a field left empty produces no line at all,
// because an option written with its default reads as a decision and the next
// person to open the file cannot tell it from one.

import { describe, expect, it } from 'vitest'
import { previewLines } from '../src/client/MachineControl.tsx'

describe('the entry the add dialog previews', () => {
  it('writes nothing at all until the machine has a name', () => {
    expect(previewLines({ alias: '' })).toEqual([])
    expect(previewLines({ alias: '   ' })).toEqual([])
  })

  it('writes only the fields that were filled in', () => {
    expect(previewLines({ alias: 'build-box', hostName: '10.0.0.42' })).toEqual([
      'Host build-box',
      '  HostName 10.0.0.42',
    ])
  })

  it('leaves an emptied optional field unwritten rather than writing its default', () => {
    expect(previewLines({ alias: 'build-box', hostName: '10.0.0.42', user: '  ', identityFile: '' })).toEqual([
      'Host build-box',
      '  HostName 10.0.0.42',
    ])
  })

  it('keeps the alias one token, because a name with spaces is several Host patterns', () => {
    expect(previewLines({ alias: 'the office box' })[0]).toBe('Host the-office-box')
  })

  it('orders the options the way the file reads: address, account, port, key', () => {
    expect(previewLines({
      alias: 'gpu', hostName: 'gpu.internal', user: 'roy', port: 2222, identityFile: '~/.ssh/id_ed25519',
    })).toEqual([
      'Host gpu',
      '  HostName gpu.internal',
      '  User roy',
      '  Port 2222',
      '  IdentityFile ~/.ssh/id_ed25519',
    ])
  })
})
