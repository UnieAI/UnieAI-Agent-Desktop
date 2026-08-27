/**
 * What the machine a session runs on is doing right now.
 *
 * One service, `ctx.machineMetrics`, with one method: sample it. The sample is
 * taken by running a shell command through `ctx.subprocess`, which is the seam
 * the execution router already points at the machine a person picked — so this
 * package needs to know nothing about machines, and a reading of a remote box
 * and a reading of this computer are the same code path.
 *
 * WHY NOT A NODE LIBRARY. `os.cpus()` and friends answer for the process that
 * calls them, which is this computer, always. A person who pointed a session at
 * a GPU host and watched this laptop's gauges would be reading a lie that looks
 * exactly like the truth.
 *
 * PROCESSOR PERCENT IS A DIFFERENCE. `/proc/stat` reports cumulative time, so
 * a percentage needs two readings; the alternative is a command that sleeps a
 * second on the machine, every poll, holding a connection to do nothing. The
 * service keeps the previous reading per machine and subtracts, which is what
 * `top` does — and the first poll of a machine reports no percentage at all
 * rather than a zero it did not measure.
 *
 * @module @unieai/uad-machine-metrics
 */

import { Service, type Context } from '@unieai/cordis'
// Type-only: brings the subprocess seam's `Context` merge, so the runtime read
// below is the provider rather than `any`.
import type {} from '@unieai/uad-subprocess'
import z from '@unieai/schemastery'
import type Schema from '@unieai/schemastery'
import { busyPercent, readMachine, readingCommand } from './probe.ts'
import type { AcceleratorReading, MachineReading, ProcessorTicks } from './probe.ts'

export type { AcceleratorReading, MachineReading, ProcessorTicks } from './probe.ts'
export {
  busyPercent, readDisk, readGpus, readMachine, readMemory, readNpus, readProcessor, readingCommand,
} from './probe.ts'

/** One machine, as the surface that draws gauges needs it. */
export interface MachineMetrics {
  /** When the sample was taken, ISO 8601. */
  at: string
  /** Percent of processor time busy since the previous sample; absent on the first. */
  cpuPercent?: number
  /** Logical processors, when the machine reports a count. */
  cores?: number
  /** Load averages over 1, 5 and 15 minutes. */
  load?: readonly [number, number, number]
  /** Memory in use, in bytes. */
  memoryUsedBytes?: number
  /** Memory installed, in bytes. */
  memoryTotalBytes?: number
  /** Space used on the filesystem holding the sampled path. */
  diskUsedBytes?: number
  /** That filesystem's total space. */
  diskTotalBytes?: number
  /** Which filesystem the disk figures describe. */
  diskMount?: string
  /** Every GPU a vendor tool reported. */
  gpus: readonly AcceleratorReading[]
  /** Every NPU a vendor tool reported. */
  npus: readonly AcceleratorReading[]
}

/** Why a sample could not be taken. */
export type MetricsRefusal =
  /** The composition mounts no subprocess provider, so nothing can be run anywhere. */
  | { kind: 'no-execution-world' }
  /** The command ran and failed, or the machine could not be reached. */
  | { kind: 'unreachable'; message: string }

/** Machine-metrics configuration. */
export interface Config {
  /** Path whose filesystem the disk figures describe. Defaults to the harness's cwd. */
  diskPath?: string
  /** Milliseconds a sample may take before it is abandoned. */
  timeoutMs?: number
}

/**
 * Machine-metrics configuration schema.
 *
 * Exported and declared as a top-level `z.object` call so the config catalogue
 * can walk it: the generator reads the expression, not the runtime value.
 */
export const Config: Schema<Config> = z.object({
  diskPath: z.string(),
  timeoutMs: z.natural().default(5000),
})

/** Output bound: the command's own output is a few hundred bytes on any machine. */
const OUTPUT = { maxBytes: 64 * 1024 } as const

/**
 * The machine-metrics service.
 *
 * Holds one thing between calls: the previous processor reading per world, so
 * a percentage can be a difference. That memory is keyed by the identity the
 * router gives a world rather than by machine name, because this package never
 * learns which machine it is reading — it asks the seam, and the seam is
 * already pointed somewhere.
 */
export class MachineMetricsService extends Service {
  static readonly inject = ['subprocess']
  static Config: Schema<Config> = Config

  /** The previous processor reading, for the difference the next sample needs. */
  private previous: ProcessorTicks | undefined
  /** Which execution world that reading came from; a different one starts over. */
  private previousWorld: unknown

  constructor(ctx: Context, public config: Config = {}) {
    super(ctx, 'machineMetrics')
  }

  /**
   * Read the machine the current execution world runs on.
   *
   * Every field is optional and an unreadable one is absent, so a container
   * with no `/proc`, a machine with no GPU, and a kernel that spells something
   * differently each produce a smaller reading rather than a failure. Only two
   * things are refusals: a composition with no subprocess provider at all, and
   * a command that could not be run.
   * @param signal - abandons the sample.
   * @returns the reading, or why there is none.
   */
  async sample(signal?: AbortSignal): Promise<MachineMetrics | MetricsRefusal> {
    const runtime = this.ctx.get('subprocess')
    if (runtime === undefined) return { kind: 'no-execution-world' }

    const path = this.config.diskPath ?? process.cwd()
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 5_000)
    const bound = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    try {
      const handle = runtime.spawn({
        argv: ['/bin/sh', '-c', readingCommand(path)],
        cwd: path,
        stdio: { stdin: 'ignore', stdout: OUTPUT, stderr: OUTPUT },
        graceMs: 2_000,
        signal: bound,
      })
      const outcome = await handle.done
      const text = handle.collected.stdout?.readFrom(0).text ?? ''
      // A non-zero exit with output is still a reading: every stage of the
      // command is guarded, so the status that reaches here is the shell's own
      // and the sections that did run are what a person wants to see.
      if (text.trim() === '') {
        return { kind: 'unreachable', message: `the reading command exited ${String(outcome.exitCode)} with no output` }
      }
      return this.project(readMachine(text), runtime)
    } catch (error: unknown) {
      return { kind: 'unreachable', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Turn one reading into what a surface draws, carrying the processor
   * difference across calls.
   * @param reading - what the command said.
   * @param world - the runtime this reading came from.
   * @returns the metrics.
   */
  private project(reading: MachineReading, world: unknown): MachineMetrics {
    // A world that changed under us invalidates the difference: subtracting
    // one machine's counters from another's produces a number, and it means
    // nothing.
    const previous = this.previousWorld === world ? this.previous : undefined
    this.previousWorld = world
    this.previous = reading.ticks
    const cpuPercent = busyPercent(previous, reading.ticks)
    return {
      at: new Date().toISOString(),
      ...cpuPercent === undefined ? {} : { cpuPercent },
      ...reading.cores === undefined ? {} : { cores: reading.cores },
      ...reading.load === undefined ? {} : { load: reading.load },
      ...reading.memoryUsedBytes === undefined ? {} : { memoryUsedBytes: reading.memoryUsedBytes },
      ...reading.memoryTotalBytes === undefined ? {} : { memoryTotalBytes: reading.memoryTotalBytes },
      ...reading.diskUsedBytes === undefined ? {} : { diskUsedBytes: reading.diskUsedBytes },
      ...reading.diskTotalBytes === undefined ? {} : { diskTotalBytes: reading.diskTotalBytes },
      ...reading.diskMount === undefined ? {} : { diskMount: reading.diskMount },
      gpus: reading.gpus,
      npus: reading.npus,
    }
  }
}

declare module '@unieai/cordis' {
  interface Context {
    machineMetrics: MachineMetricsService
  }
}

export default MachineMetricsService
