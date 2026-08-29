/**
 * What the machine is doing, as the strip reads it.
 *
 * POLLED, NOT PUSHED. Each reading is a command run on someone's machine, so
 * it happens when a person is looking at the strip and stops when they are
 * not: the view is asked to start when the strip mounts and to stop when it
 * unmounts, and a hidden tab stops too. A push would mean running that command
 * forever on every machine anyone ever selected.
 *
 * A FAILED POLL KEEPS THE LAST READING. A machine that missed one sample is
 * still described by the sample before it, and blanking the strip on a dropped
 * connection would make a brief hiccup look like a machine that went away. The
 * strip says the reading is stale instead.
 */

import type { MachineMetricsView } from '@unieai/uad-api-remotes/client'

/** How often the strip re-reads while it is on screen. */
export const POLL_INTERVAL_MS = 4_000

/** Everything the strip renders from. */
export interface GaugesState {
  /** The last reading, or undefined before the first one lands. */
  reading?: MachineMetricsView
  /** Whether a poll is in flight. */
  busy: boolean
  /** Why the last poll failed, in the host's own words; empty when it did not. */
  error: string
  /** Whether this deployment can measure a machine at all. */
  supported: boolean
}

/** The state before anything has been read. */
export const INITIAL_GAUGES: GaugesState = { busy: false, error: '', supported: true }

/** The host call this view makes. */
export interface GaugesRoutes {
  /**
   * Read the machine work happens on.
   * @returns the reading, or why there is none.
   */
  read(): Promise<
    | { ok: true; reading: MachineMetricsView }
    | { ok: false; code: string; message: string }
  >
}

/** The browser facilities this view uses, named so a test can drive them. */
export interface GaugesEnvironment {
  /** Schedule the next poll. */
  setTimeout: (run: () => void, ms: number) => unknown
  /** Cancel a scheduled poll. */
  clearTimeout: (handle: unknown) => void
  /** Whether the surface is currently visible; a hidden tab does not poll. */
  visible: () => boolean
}

/** A snapshot store the strip binds to, plus its lifecycle. */
export interface GaugesView {
  getSnapshot(): GaugesState
  subscribe(listener: () => void): () => void
  /** Begin polling; returns the stop for the caller to run on unmount. */
  start(): () => void
  /**
   * Read again now, discarding the reading on screen.
   *
   * For the one event that makes the last reading WRONG rather than merely
   * old: work moved to another machine. Waiting out the interval would leave
   * one machine's figures standing under another machine's name, and keeping
   * them — which is right for a missed sample — would say the new machine
   * looks exactly like the old one. Does nothing while nobody is watching.
   */
  resample(): void
}

/**
 * Build the view.
 * @param routes - the host call.
 * @param environment - browser facilities; defaults to the real ones.
 * @returns the store and its lifecycle.
 */
export function createGaugesView(routes: GaugesRoutes, environment: GaugesEnvironment): GaugesView {
  let state = INITIAL_GAUGES
  let timer: unknown
  let readers = 0
  // A generation rather than a stopped flag. The check that matters happens
  // AFTER an await, and a boolean the compiler has already narrowed reads as
  // dead code there; comparing the generation a poll started in against the
  // current one says the same thing and stays true to the type checker.
  let generation = 0
  const listeners = new Set<() => void>()
  const publish = (next: Partial<GaugesState>): void => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const poll = async (mine: number): Promise<void> => {
    if (mine !== generation) return
    // A hidden tab schedules the next check without spending a command on a
    // machine nobody is watching.
    if (!environment.visible()) {
      schedule()
      return
    }
    publish({ busy: true })
    const answer = await routes.read()
    // Stopped, or restarted, while this poll was in flight.
    if (mine !== generation) return
    if (answer.ok) publish({ reading: answer.reading, busy: false, error: '' })
    else if (answer.code === 'metrics-unavailable') {
      // Nothing here can measure anything: stop asking. The strip draws
      // nothing for this, so a deployment without the sampler pays one call.
      publish({ busy: false, supported: false, error: '' })
      return
    } else publish({ busy: false, error: answer.message })
    schedule()
  }

  function schedule(): void {
    const mine = generation
    timer = environment.setTimeout(() => { void poll(mine) }, POLL_INTERVAL_MS)
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    resample: () => {
      // No reader means no timer to displace and no strip to update; the next
      // start() reads fresh anyway.
      if (readers === 0) return
      // A new generation abandons the poll in flight, whose answer describes
      // the machine that is no longer selected.
      generation += 1
      if (timer !== undefined) environment.clearTimeout(timer)
      timer = undefined
      // The key is dropped rather than set to undefined: "no reading yet" is
      // the absence of the property, which is what the strip's first-poll
      // rendering already reads, and `exactOptionalPropertyTypes` keeps the
      // two apart.
      const { reading: _abandoned, ...withoutReading } = state
      state = { ...withoutReading, error: '' }
      for (const listener of listeners) listener()
      void poll(generation)
    },
    start: () => {
      readers += 1
      if (readers === 1) {
        generation += 1
        void poll(generation)
      }
      return () => {
        readers -= 1
        // The last reader leaving stops the polling; a second strip mounting
        // (a split view, a re-render across a remount) must not start a
        // second timer, which is what the counter is for.
        if (readers > 0) return
        // A new generation abandons every poll and every timer of the old one.
        generation += 1
        if (timer !== undefined) environment.clearTimeout(timer)
        timer = undefined
      }
    },
  }
}

/** One gauge as the strip draws it: a label, a percentage, and its detail line. */
export interface Gauge {
  /** Which reading this is, for the dictionary key and the test. */
  key: 'cpu' | 'memory' | 'disk' | 'gpu' | 'npu'
  /** 0–100, for the bar. */
  percent: number
  /** The figure beside the bar, already formatted. */
  value: string
}

/**
 * Bytes as a person reads them: three significant figures and a binary unit.
 * @param bytes - the figure to render.
 * @returns the text, unit included.
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${String(rounded)} ${units[unit] ?? 'B'}`
}

/**
 * The gauges one reading supports.
 *
 * A reading with no processor percentage contributes no processor gauge — the
 * first poll after a machine is selected, and every poll of a machine with no
 * `/proc`. Drawing an empty bar there would say the machine is idle, which is
 * a different claim from "not measured".
 * @param reading - the last reading.
 * @returns the gauges, in the order the strip draws them.
 */
export function gaugesOf(reading: MachineMetricsView): Gauge[] {
  const gauges: Gauge[] = []
  if (reading.cpuPercent !== undefined) {
    gauges.push({ key: 'cpu', percent: reading.cpuPercent, value: `${String(Math.round(reading.cpuPercent))}%` })
  }
  if (reading.memoryUsedBytes !== undefined && reading.memoryTotalBytes !== undefined && reading.memoryTotalBytes > 0) {
    gauges.push({
      key: 'memory',
      percent: (reading.memoryUsedBytes / reading.memoryTotalBytes) * 100,
      value: `${formatBytes(reading.memoryUsedBytes)} / ${formatBytes(reading.memoryTotalBytes)}`,
    })
  }
  const gpu = reading.gpus[0]
  if (gpu?.utilPercent !== undefined) {
    gauges.push({ key: 'gpu', percent: gpu.utilPercent, value: `${String(Math.round(gpu.utilPercent))}%` })
  }
  const npu = reading.npus[0]
  if (npu?.utilPercent !== undefined) {
    gauges.push({ key: 'npu', percent: npu.utilPercent, value: `${String(Math.round(npu.utilPercent))}%` })
  }
  if (reading.diskUsedBytes !== undefined && reading.diskTotalBytes !== undefined && reading.diskTotalBytes > 0) {
    gauges.push({
      key: 'disk',
      percent: (reading.diskUsedBytes / reading.diskTotalBytes) * 100,
      value: `${formatBytes(reading.diskUsedBytes)} / ${formatBytes(reading.diskTotalBytes)}`,
    })
  }
  return gauges
}
