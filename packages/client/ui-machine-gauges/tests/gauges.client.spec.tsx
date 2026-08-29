// @vitest-environment jsdom
/**
 * The gauges: what polls, what stops, and what a reading with holes in it
 * draws.
 *
 * The rule the whole surface rests on is that an unmeasured reading is absent
 * rather than zero — a bar at zero says the machine is idle, which is a
 * different claim from "nobody measured it". Every case below is a way that
 * distinction could be lost.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@unieai/uad-client-test-runtime'
import type { MachineMetricsView } from '@unieai/uad-api-remotes/client'
import { MachineGauges } from '../src/client/MachineGauges.tsx'
import type { MachineGaugesProps } from '../src/client/MachineGauges.tsx'
import { INITIAL_GAUGES, createGaugesView, formatBytes, gaugesOf } from '../src/client/gauges-view.ts'
import type { GaugesEnvironment, GaugesState } from '../src/client/gauges-view.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh) as MachineGaugesProps['t']

/** What one poll answers with. */
type Answer =
  | { ok: true; reading: MachineMetricsView }
  | { ok: false; code: string; message: string }

/**
 * A reading with everything filled in; `without` drops the fields a case is
 * about, because an absent field and a zero are the distinction under test and
 * `exactOptionalPropertyTypes` will not let one be spelled as `undefined`.
 */
const reading = (over: Partial<MachineMetricsView> = {}, without: string[] = []): MachineMetricsView =>
  Object.fromEntries(
    Object.entries(base(over)).filter(([key]) => !without.includes(key)),
  ) as unknown as MachineMetricsView

const base = (over: Partial<MachineMetricsView> = {}): MachineMetricsView => ({
  machine: 'build-box',
  at: '2026-08-27T09:00:00.000Z',
  cpuPercent: 41,
  cores: 16,
  memoryUsedBytes: 8 * 1024 ** 3,
  memoryTotalBytes: 32 * 1024 ** 3,
  diskUsedBytes: 100 * 1024 ** 3,
  diskTotalBytes: 500 * 1024 ** 3,
  diskMount: '/',
  gpus: [],
  npus: [],
  ...over,
})

/** A clock the test drives, so nothing waits on a real timer. */
function clock(): GaugesEnvironment & { fire(): void; pending(): number } {
  const runs: (() => void)[] = []
  return {
    setTimeout: (run) => { runs.push(run); return runs.length },
    clearTimeout: (handle) => { runs[(handle as number) - 1] = () => {} },
    visible: () => true,
    fire: () => { const next = runs.shift(); next?.() },
    pending: () => runs.length,
  }
}

function props(state: GaugesState, startPolling = (): (() => void) => () => {}): MachineGaugesProps {
  return {
    t,
    useGauges: (select: (snapshot: GaugesState) => unknown) => select(state),
    startPolling,
  } as unknown as MachineGaugesProps
}

describe('gaugesOf', () => {
  it('draws no processor bar for a reading that measured no percentage', () => {
    // The first poll of a machine, and every poll of one with no /proc. An
    // empty bar there would say the machine is idle.
    const gauges = gaugesOf(reading({}, ['cpuPercent']))
    expect(gauges.map(gauge => gauge.key)).not.toContain('cpu')
  })

  it('draws a memory bar only when both halves of the fraction were read', () => {
    expect(gaugesOf(reading({}, ['memoryTotalBytes'])).map(gauge => gauge.key)).not.toContain('memory')
    expect(gaugesOf(reading({}, ['memoryUsedBytes'])).map(gauge => gauge.key)).not.toContain('memory')
  })

  it('never divides by a total of zero', () => {
    expect(gaugesOf(reading({ memoryTotalBytes: 0 })).map(gauge => gauge.key)).not.toContain('memory')
  })

  it('puts the accelerator before the disk, because it is what changes', () => {
    const gauges = gaugesOf(reading({ gpus: [{ name: 'H100', utilPercent: 90 }] }))
    expect(gauges.map(gauge => gauge.key)).toEqual(['cpu', 'memory', 'gpu', 'disk'])
  })

  it('draws no accelerator bar for a device that reported no utilization', () => {
    const gauges = gaugesOf(reading({ gpus: [{ name: 'A100', memoryUsedBytes: 1024 }] }))
    expect(gauges.map(gauge => gauge.key)).not.toContain('gpu')
  })
})

describe('formatBytes', () => {
  it('reads as a person would write it', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(32 * 1024 ** 3)).toBe('32 GB')
    expect(formatBytes(2.5 * 1024 ** 4)).toBe('2.5 TB')
  })
})

describe('the polling view', () => {
  it('reads once on start and schedules the next', async () => {
    const environment = clock()
    let calls = 0
    const view = createGaugesView({
      read: () => { calls += 1; return Promise.resolve({ ok: true as const, reading: reading() }) },
    }, environment)

    const stop = view.start()
    await vi.waitFor(() => { expect(calls).toBe(1) })
    expect(environment.pending()).toBe(1)
    stop()
  })

  it('drops the reading and reads again when work moves to another machine', async () => {
    // A reading describes the machine it was taken on. After a switch it is
    // not stale, it is about somewhere else — and keeping it (right for a
    // missed sample) would put one machine's figures under another's name.
    const environment = clock()
    const answers: MachineMetricsView[] = [reading({ machine: 'local' }), reading({ machine: 'build-box' })]
    let calls = 0
    const view = createGaugesView({
      read: () => {
        const next = answers[calls] ?? answers[answers.length - 1]
        calls += 1
        return Promise.resolve({ ok: true as const, reading: next as MachineMetricsView })
      },
    }, environment)

    const stop = view.start()
    await vi.waitFor(() => { expect(view.getSnapshot().reading?.machine).toBe('local') })

    view.resample()
    // The old machine's figures are gone the instant the move is known, not
    // when the next answer lands.
    expect(view.getSnapshot().reading).toBeUndefined()
    await vi.waitFor(() => { expect(view.getSnapshot().reading?.machine).toBe('build-box') })
    stop()
  })

  it('does not read on a machine nobody is watching', () => {
    const environment = clock()
    let calls = 0
    const view = createGaugesView({
      read: () => { calls += 1; return Promise.resolve({ ok: true as const, reading: reading() }) },
    }, environment)

    view.resample()
    expect(calls).toBe(0)
  })

  it('stops when the last reader leaves, and not before', async () => {
    const environment = clock()
    let calls = 0
    const view = createGaugesView({
      read: () => { calls += 1; return Promise.resolve({ ok: true as const, reading: reading() }) },
    }, environment)

    const first = view.start()
    const second = view.start()
    await vi.waitFor(() => { expect(calls).toBe(1) })
    // A second strip must not start a second timer, and one leaving must not
    // stop the other's polling.
    first()
    environment.fire()
    await vi.waitFor(() => { expect(calls).toBe(2) })
    second()
    environment.fire()
    expect(calls).toBe(2)
  })

  it('keeps the last reading when a poll fails, and says it is stale', async () => {
    const environment = clock()
    let answer: Answer = { ok: true, reading: reading() }
    const view = createGaugesView({ read: (): Promise<Answer> => Promise.resolve(answer) }, environment)

    view.start()
    await vi.waitFor(() => { expect(view.getSnapshot().reading).toBeDefined() })
    answer = { ok: false, code: 'metrics-unreadable', message: 'no answer from build-box' }
    environment.fire()
    await vi.waitFor(() => { expect(view.getSnapshot().error).toBe('no answer from build-box') })
    // Blanking here would make a dropped connection look like a machine that
    // went away.
    expect(view.getSnapshot().reading?.machine).toBe('build-box')
  })

  it('stops asking a deployment that cannot measure anything', async () => {
    const environment = clock()
    let calls = 0
    const view = createGaugesView({
      read: () => {
        calls += 1
        return Promise.resolve({ ok: false as const, code: 'metrics-unavailable', message: 'no sampler' })
      },
    }, environment)

    view.start()
    await vi.waitFor(() => { expect(view.getSnapshot().supported).toBe(false) })
    expect(environment.pending()).toBe(0)
    expect(calls).toBe(1)
  })

  it('spends no command on a machine while the tab is hidden', async () => {
    const environment = { ...clock(), visible: () => false }
    let calls = 0
    const view = createGaugesView({
      read: () => { calls += 1; return Promise.resolve({ ok: true as const, reading: reading() }) },
    }, environment)

    view.start()
    await vi.waitFor(() => { expect(environment.pending()).toBe(1) })
    expect(calls).toBe(0)
  })
})

describe('the strip', () => {
  it('draws nothing at all before the first reading lands', () => {
    const { container } = render(<MachineGauges {...props(INITIAL_GAUGES)} />)
    expect(container.firstChild).toBeNull()
  })

  it('draws nothing on a deployment that cannot measure a machine', () => {
    const { container } = render(<MachineGauges {...props({ ...INITIAL_GAUGES, supported: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it('opens the whole reading, naming the machine it describes', () => {
    render(<MachineGauges {...props({ ...INITIAL_GAUGES, reading: reading() })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('build-box')).toBeTruthy()
    expect(screen.getByText(zh['gauges.cores'])).toBeTruthy()
    expect(screen.getByText('8 GB / 32 GB')).toBeTruthy()
  })

  it('says a machine reported no accelerator rather than drawing an empty list', () => {
    render(<MachineGauges {...props({ ...INITIAL_GAUGES, reading: reading() })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(zh['gauges.noAccelerator'])).toBeTruthy()
  })

  it('lists every accelerator in the panel, not only the one on the strip', () => {
    render(<MachineGauges {...props({
      ...INITIAL_GAUGES,
      reading: reading({
        gpus: [{ name: 'H100 #0', utilPercent: 90 }, { name: 'H100 #1', utilPercent: 10 }],
        npus: [{ name: 'Ascend 910B', utilPercent: 5 }],
      }),
    })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('H100 #1')).toBeTruthy()
    expect(screen.getByText('Ascend 910B')).toBeTruthy()
  })

  it('marks a stale strip and says so once opened', () => {
    render(<MachineGauges {...props({ ...INITIAL_GAUGES, reading: reading(), error: 'no answer' })} />)
    expect(screen.getByRole('button').getAttribute('data-stale')).toBe('true')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(zh['gauges.stale'])).toBeTruthy()
  })

  it('polls while it is on screen and stops when it leaves', () => {
    let started = 0
    let stopped = 0
    const { unmount } = render(<MachineGauges {...props({ ...INITIAL_GAUGES, reading: reading() }, () => {
      started += 1
      return () => { stopped += 1 }
    })} />)
    expect(started).toBe(1)
    unmount()
    expect(stopped).toBe(1)
  })
})
