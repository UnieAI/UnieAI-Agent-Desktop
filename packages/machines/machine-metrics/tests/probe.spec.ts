/**
 * The reading command and its parsers.
 *
 * Two kinds of assertion carry this file. The command is parsed by a real
 * shell (`sh -n`) rather than matched against a pattern, because the defect
 * this text is prone to — a `;` fragment joined with a `; ` joiner producing
 * `;;` — is invisible to a pattern and fatal to the command. The parsers are
 * given real output from real machines, and the rule they must obey is that a
 * field nobody could read comes back absent rather than zero: a gauge showing
 * 0% for a reading that was never taken is a lie someone acts on.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  busyPercent, readDisk, readGpus, readMachine, readMemory, readNpus, readProcessor, readingCommand,
} from '../src/probe.ts'

/** Ask a real shell whether the text is a script, without running it. */
const parses = (text: string): boolean => {
  try {
    execFileSync('/bin/sh', ['-n'], { input: text })
    return true
  } catch {
    return false
  }
}

describe('the reading command', () => {
  it('is a script a real shell accepts', () => {
    expect(parses(readingCommand('/home/dev/project'))).toBe(true)
  })

  it('stays a script for a path holding a quote, a space, or a newline', () => {
    for (const path of ["/home/o'brien/work", '/home/dev/my project', '/home/dev/two\nlines']) {
      expect(parses(readingCommand(path)), path).toBe(true)
    }
  })

  it('never lets a path escape into the command, proved by running it', () => {
    // Asserting on the text would only assert that quoting happened; running
    // it asserts that the quoting works. The path below is a shell fragment
    // that would create a file if the quoting let it out.
    const directory = mkdtempSync(join(tmpdir(), 'dsh-metrics-'))
    const marker = join(directory, 'escaped')
    execFileSync('/bin/sh', ['-c', readingCommand(`${directory}/x'; touch ${marker}; echo '`)], {
      encoding: 'utf8',
    })
    expect(existsSync(marker)).toBe(false)
  })
})

describe('the processor section', () => {
  const LINUX = ['cpu  1000 20 300 8000 100 0 40 0 0 0', '16', ' 17:49:48 up 98 days, 11 users,  load average: 4.75, 3.55, 2.91']

  it('reads cumulative ticks, counting iowait as idle', () => {
    // Idle is columns four and five; a machine waiting on disk is not busy,
    // and counting iowait as work makes a stalled machine look saturated.
    const reading = readProcessor(LINUX)
    expect(reading.ticks).toEqual({ busy: 1000 + 20 + 300 + 0 + 40, total: 9460 })
    expect(reading.cores).toBe(16)
    expect(reading.load).toEqual([4.75, 3.55, 2.91])
  })

  it('reports no ticks for a machine with no /proc, and still reads what it can', () => {
    const reading = readProcessor(['8', '17:49  up 3 days, 2 users, load averages: 1.20 1.05 0.98'])
    expect(reading.ticks).toBeUndefined()
    expect(reading.cores).toBe(8)
    expect(reading.load).toEqual([1.2, 1.05, 0.98])
  })

  it('reads nothing at all from an empty section rather than reporting zeros', () => {
    expect(readProcessor([])).toEqual({})
  })
})

describe('the processor percentage', () => {
  it('is the difference between two readings', () => {
    expect(busyPercent({ busy: 100, total: 1000 }, { busy: 150, total: 1100 })).toBe(50)
  })

  it('is absent on the first reading, because one reading is not a rate', () => {
    expect(busyPercent(undefined, { busy: 100, total: 1000 })).toBeUndefined()
  })

  it('is absent when the counter did not advance, rather than dividing by zero', () => {
    expect(busyPercent({ busy: 100, total: 1000 }, { busy: 100, total: 1000 })).toBeUndefined()
  })

  it('is absent when the counter went backwards, which is a reboot', () => {
    expect(busyPercent({ busy: 500, total: 5000 }, { busy: 10, total: 100 })).toBeUndefined()
  })
})

describe('the memory section', () => {
  it('reads available rather than free, so the page cache is not counted as used', () => {
    // MemFree on a healthy Linux machine is single digits; a gauge built on it
    // reports every machine as permanently full.
    const reading = readMemory(['MemTotal:       32308660 kB', 'MemAvailable:   13920336 kB'])
    expect(reading.memoryTotalBytes).toBe(32308660 * 1024)
    expect(reading.memoryUsedBytes).toBe((32308660 - 13920336) * 1024)
  })

  it('reads the Mach form as free plus reclaimable pages', () => {
    const reading = readMemory([
      '17179869184',
      'Mach Virtual Memory Statistics: (page size of 4096 bytes)',
      'Pages free:                               100000.',
      'Pages inactive:                            50000.',
      'Pages speculative:                         10000.',
      'Pages wired down:                         200000.',
    ])
    expect(reading.memoryTotalBytes).toBe(17179869184)
    expect(reading.memoryUsedBytes).toBe(17179869184 - 160000 * 4096)
  })

  it('reports a total with no used figure rather than inventing one', () => {
    expect(readMemory(['MemTotal:       32308660 kB'])).toEqual({ memoryTotalBytes: 32308660 * 1024 })
  })
})

describe('the disk section', () => {
  it('reads the row, not the header, in 1024-byte blocks', () => {
    const reading = readDisk([
      'Filesystem     1024-blocks       Used Available Capacity Mounted on',
      '/dev/root       2079140828 1352397460 726726984      66% /',
    ])
    expect(reading.diskTotalBytes).toBe(2079140828 * 1024)
    expect(reading.diskUsedBytes).toBe(1352397460 * 1024)
    expect(reading.diskMount).toBe('/')
  })

  it('reads a mount point containing spaces from the end of the row', () => {
    const reading = readDisk(['/dev/disk1s2  100 40 60 40% /Volumes/My Drive'])
    expect(reading.diskMount).toBe('Drive')
  })

  it('reads nothing from a df that printed only its header', () => {
    expect(readDisk(['Filesystem     1024-blocks       Used Available Capacity Mounted on'])).toEqual({})
  })
})

describe('the GPU section', () => {
  it('reads one row per device, converting megabytes to bytes', () => {
    const gpus = readGpus(['NVIDIA H100 PCIe, 73, 40960, 81559, 61', 'NVIDIA H100 PCIe, 0, 4, 81559, 32'])
    expect(gpus).toHaveLength(2)
    expect(gpus[0]).toEqual({
      name: 'NVIDIA H100 PCIe',
      utilPercent: 73,
      memoryUsedBytes: 40960 * 1024 * 1024,
      memoryTotalBytes: 81559 * 1024 * 1024,
      temperatureC: 61,
    })
  })

  it('keeps a device whose utilization is unavailable, without the field', () => {
    // Virtualized devices report [N/A] for utilization; dropping the card
    // would hide a GPU someone is paying for.
    const gpus = readGpus(['NVIDIA A100-SXM4-40GB, [N/A], 1024, 40536, [N/A]'])
    expect(gpus).toHaveLength(1)
    expect(gpus[0]?.utilPercent).toBeUndefined()
    expect(gpus[0]?.memoryUsedBytes).toBe(1024 * 1024 * 1024)
  })

  it('reads no devices from an empty section', () => {
    expect(readGpus([])).toEqual([])
  })
})

describe('the NPU section', () => {
  it('reads a Rockchip load line as one entry per core', () => {
    const npus = readNpus(['NPU load:  Core0: 12%, Core1:  0%, Core2: 45%,'])
    expect(npus.map(npu => npu.utilPercent)).toEqual([12, 0, 45])
  })

  it('reads an Ascend table row', () => {
    const npus = readNpus([
      '| NPU   Name        | Health | Power(W)  Temp(C)  Hugepages-Usage(page) |',
      '| 0     910B3       | OK     | 88.5      46       0     / 0             |',
    ])
    expect(npus).toHaveLength(1)
    expect(npus[0]?.name).toBe('910B3 #0')
    expect(npus[0]?.temperatureC).toBe(88.5)
  })

  it('reads no devices from a machine whose accelerator it does not know', () => {
    // No universal tool exists; an unrecognised one is reported as no NPU,
    // which is what a machine without one reports too.
    expect(readNpus(['some other vendor tool output'])).toEqual([])
  })
})

describe('a whole reading', () => {
  const OUTPUT = [
    '@dsh:cpu',
    'cpu  1000 20 300 8000 100 0 40 0 0 0',
    '16',
    ' 17:49:48 up 98 days, 11 users,  load average: 4.75, 3.55, 2.91',
    '@dsh:mem',
    'MemTotal:       32308660 kB',
    'MemAvailable:   13920336 kB',
    '@dsh:disk',
    'Filesystem     1024-blocks       Used Available Capacity Mounted on',
    '/dev/root       2079140828 1352397460 726726984      66% /',
    '@dsh:gpu',
    '@dsh:npu',
  ].join('\n')

  it('splits sections and reads each one', () => {
    const reading = readMachine(OUTPUT)
    expect(reading.cores).toBe(16)
    expect(reading.memoryTotalBytes).toBe(32308660 * 1024)
    expect(reading.diskMount).toBe('/')
    expect(reading.gpus).toEqual([])
    expect(reading.npus).toEqual([])
  })

  it('reads a machine that answered nothing as a reading with no fields', () => {
    const reading = readMachine('')
    expect(reading).toEqual({ gpus: [], npus: [] })
  })

  it('cannot read one section into another', () => {
    // A `df` row inside the memory section must not become disk figures: the
    // sections are what tells the parser which grammar a line is in.
    const reading = readMachine('@dsh:mem\n/dev/root 100 40 60 40% /\n@dsh:disk\n')
    expect(reading.diskTotalBytes).toBeUndefined()
  })
})
