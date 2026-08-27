/**
 * The one shell command that reads a machine, and the parsing of what it says.
 *
 * WHY A SHELL COMMAND. The same code has to answer for this computer and for a
 * machine reached over `ssh`, and the only thing both worlds share is
 * `ctx.subprocess` plus a POSIX shell — the seam the remote machine decision
 * already rests on. A Node library reading `/proc` would answer for the wrong
 * computer the moment a session points elsewhere.
 *
 * WHY ONE COMMAND. Each reading is one round trip, and a remote machine on a
 * 30 ms link would spend a quarter of a second per poll if processor, memory,
 * disk and accelerators were asked for separately. One command emits every
 * section, tagged, and the parser splits it.
 *
 * WHAT IS ABSENT STAYS ABSENT. A machine with no `nvidia-smi` has no GPU
 * section, a kernel that spells something differently produces no number, and
 * every field this file cannot read is `undefined` rather than zero. A gauge
 * showing 0% for a reading nobody took is a lie a person acts on.
 */

/** One accelerator, as far as its own vendor tool reports it. */
export interface AcceleratorReading {
  /** Vendor's own name for the device. */
  name: string
  /** Percent of the device busy, when the tool reports utilization. */
  utilPercent?: number
  /** Device memory in use, in bytes. */
  memoryUsedBytes?: number
  /** Device memory installed, in bytes. */
  memoryTotalBytes?: number
  /** Device temperature in Celsius, when reported. */
  temperatureC?: number
}

/** Cumulative processor time, from which a percentage is a difference. */
export interface ProcessorTicks {
  /** Ticks spent doing anything other than idling. */
  busy: number
  /** Ticks spent in every state, idle included. */
  total: number
}

/** One machine, as one poll saw it. */
export interface MachineReading {
  /** How many logical processors the machine has. */
  cores?: number
  /**
   * Cumulative processor time.
   *
   * Not a percentage: a percentage is a difference between two readings, and
   * a command that measured one itself would have to sleep for the interval —
   * on every poll, on every machine, holding a connection open to do nothing.
   * The service subtracts consecutive polls instead, which is what `top` does.
   */
  ticks?: ProcessorTicks
  /** Load averages over 1, 5 and 15 minutes, when the machine reports them. */
  load?: readonly [number, number, number]
  /** Memory in use, in bytes — installed minus what the kernel calls available. */
  memoryUsedBytes?: number
  /** Memory installed, in bytes. */
  memoryTotalBytes?: number
  /** Space used on the filesystem holding the sampled path, in bytes. */
  diskUsedBytes?: number
  /** Space that filesystem has in total, in bytes. */
  diskTotalBytes?: number
  /** The filesystem the disk figures describe. */
  diskMount?: string
  /** Every GPU a vendor tool reported; empty when none did. */
  gpus: AcceleratorReading[]
  /** Every NPU a vendor tool reported; empty when none did. */
  npus: AcceleratorReading[]
}

/** Marker that opens each section of the command's output. */
const SECTION = '@dsh:'

/**
 * The command, for a POSIX shell on the machine being read.
 *
 * Every stage is guarded: a machine without `/proc`, without `nvidia-smi`, or
 * without `npu-smi` emits that section empty and the parser reports the fields
 * it can. The whole command therefore exits 0 on a bare container and on a
 * GPU host alike, and a non-zero exit means the connection failed rather than
 * that the machine lacks a tool.
 *
 * `df -Pk` is POSIX-portable output (`-P`) in kibibytes (`-k`), which is the
 * one `df` form GNU and BSD agree on.
 * @param path - a path on the filesystem whose free space is wanted.
 * @returns the shell text.
 */
export function readingCommand(path: string): string {
  const quoted = `'${path.replaceAll('\'', '\'"\'"\'')}'`
  // Joined with newlines, not with `; `. A fragment that already ends in `;`
  // and a `; ` joiner produce `;;`, which is a syntax error everywhere except
  // inside a `case` — the same defect this repository's remote filesystem
  // shell text hit once, and the reason a test parses this with `sh -n`.
  return [
    `echo "${SECTION}cpu"`,
    'if [ -r /proc/stat ]; then',
    '  grep -E "^cpu " /proc/stat',
    '  nproc 2>/dev/null || true',
    'else',
    '  sysctl -n hw.ncpu 2>/dev/null || true',
    'fi',
    'uptime 2>/dev/null || true',
    `echo "${SECTION}mem"`,
    'if [ -r /proc/meminfo ]; then',
    '  grep -E "^(MemTotal|MemAvailable):" /proc/meminfo',
    'else',
    '  sysctl -n hw.memsize 2>/dev/null || true',
    '  vm_stat 2>/dev/null || true',
    'fi',
    `echo "${SECTION}disk"`,
    `df -Pk ${quoted} 2>/dev/null || true`,
    `echo "${SECTION}gpu"`,
    'if command -v nvidia-smi >/dev/null 2>&1; then',
    '  nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu \\',
    '    --format=csv,noheader,nounits 2>/dev/null || true',
    'fi',
    `echo "${SECTION}npu"`,
    'if command -v npu-smi >/dev/null 2>&1; then',
    '  npu-smi info 2>/dev/null || true',
    'fi',
    'if [ -r /sys/kernel/debug/rknpu/load ]; then',
    '  cat /sys/kernel/debug/rknpu/load 2>/dev/null || true',
    'fi',
  ].join('\n')
}

/** Split one output into its tagged sections. */
function sections(text: string): Record<string, string[]> {
  const found: Record<string, string[]> = {}
  let current: string | undefined
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(SECTION)) {
      current = trimmed.slice(SECTION.length)
      found[current] = []
      continue
    }
    if (current !== undefined && trimmed !== '') found[current]?.push(trimmed)
  }
  return found
}

/** A finite number, or undefined — never NaN, which renders as a gauge. */
function number(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

const KIB = 1024

/**
 * Read the processor section.
 *
 * The Linux form is `/proc/stat`'s aggregate line, whose columns are jiffies
 * per state; idle is columns 4 and 5 (idle and iowait) and everything else is
 * busy. A machine without `/proc` contributes its core count and its load
 * averages only — macOS reports processor percentages through `top`, which
 * costs a full sample of every process to ask.
 * @param lines - the section's lines.
 * @returns the processor fields this machine could answer.
 */
export function readProcessor(lines: readonly string[]): Pick<MachineReading, 'cores' | 'ticks' | 'load'> {
  const reading: { cores?: number; ticks?: ProcessorTicks; load?: readonly [number, number, number] } = {}
  for (const line of lines) {
    if (line.startsWith('cpu ')) {
      const columns = line.slice(4).trim().split(/\s+/u).map(entry => number(entry) ?? 0)
      if (columns.length >= 5) {
        const total = columns.reduce((sum, value) => sum + value, 0)
        const idle = (columns[3] ?? 0) + (columns[4] ?? 0)
        reading.ticks = { busy: total - idle, total }
      }
      continue
    }
    const averages = /load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/iu.exec(line)
    if (averages !== null) {
      const one = number(averages[1])
      const five = number(averages[2])
      const fifteen = number(averages[3])
      if (one !== undefined && five !== undefined && fifteen !== undefined) {
        reading.load = [one, five, fifteen]
      }
      continue
    }
    // A bare integer on its own line is the core count (`nproc`, `hw.ncpu`).
    const cores = /^\d+$/u.test(line) ? number(line) : undefined
    if (cores !== undefined) reading.cores = cores
  }
  return reading
}

/**
 * Read the memory section.
 *
 * `MemAvailable` rather than `MemFree`: free memory excludes the page cache,
 * so a healthy Linux machine reports single-digit free memory and a gauge
 * built on it reads as permanently full. The Mach form (`hw.memsize` plus
 * `vm_stat`) is read the same way — free plus inactive plus speculative pages
 * are what the kernel would hand out.
 * @param lines - the section's lines.
 * @returns used and total bytes, when both could be read.
 */
export function readMemory(lines: readonly string[]): Pick<MachineReading, 'memoryUsedBytes' | 'memoryTotalBytes'> {
  let total: number | undefined
  let available: number | undefined
  let pageSize: number | undefined
  let freePages = 0
  let sawPages = false

  for (const line of lines) {
    const meminfo = /^(MemTotal|MemAvailable):\s+(\d+)\s*kB$/u.exec(line)
    if (meminfo !== null) {
      const value = (number(meminfo[2]) ?? 0) * KIB
      if (meminfo[1] === 'MemTotal') total = value
      else available = value
      continue
    }
    const pageSizeLine = /page size of (\d+) bytes/u.exec(line)
    if (pageSizeLine !== null) {
      pageSize = number(pageSizeLine[1])
      continue
    }
    const pages = /^Pages (free|inactive|speculative):\s+(\d+)\.?$/u.exec(line)
    if (pages !== null) {
      freePages += number(pages[2]) ?? 0
      sawPages = true
      continue
    }
    if (total === undefined && /^\d+$/u.test(line)) total = number(line)
  }

  if (sawPages && pageSize !== undefined) available = freePages * pageSize
  if (total === undefined || available === undefined) {
    return total === undefined ? {} : { memoryTotalBytes: total }
  }
  return { memoryUsedBytes: Math.max(0, total - available), memoryTotalBytes: total }
}

/**
 * Read the disk section.
 *
 * `df -Pk` prints a header and one row per filesystem, in 1024-byte blocks.
 * The row is taken rather than the header so a long device name wrapping onto
 * its own line — which `-P` exists to prevent, and which a non-POSIX `df`
 * still does — cannot be read as figures.
 * @param lines - the section's lines.
 * @returns used, total, and which filesystem they describe.
 */
export function readDisk(lines: readonly string[]): Pick<MachineReading, 'diskUsedBytes' | 'diskTotalBytes' | 'diskMount'> {
  for (const line of lines) {
    if (line.startsWith('Filesystem')) continue
    const columns = line.split(/\s+/u)
    if (columns.length < 6) continue
    const total = number(columns[1])
    const used = number(columns[2])
    const mount = columns[columns.length - 1]
    if (total === undefined || used === undefined || mount === undefined) continue
    return { diskUsedBytes: used * KIB, diskTotalBytes: total * KIB, diskMount: mount }
  }
  return {}
}

const MIB = 1024 * 1024

/**
 * Read the GPU section: `nvidia-smi`'s CSV, one row per device.
 *
 * The query asks for values without units (`nounits`), so every column is a
 * bare number in the unit the query names — megabytes for memory, percent for
 * utilization, Celsius for temperature. A column reported as `[N/A]` — which
 * happens for utilization on some virtualized devices — leaves that one field
 * absent instead of dropping the device.
 * @param lines - the section's lines.
 * @returns one entry per device.
 */
export function readGpus(lines: readonly string[]): AcceleratorReading[] {
  const gpus: AcceleratorReading[] = []
  for (const line of lines) {
    const columns = line.split(',').map(entry => entry.trim())
    const name = columns[0]
    if (name === undefined || name === '' || columns.length < 2) continue
    const used = number(columns[2])
    const total = number(columns[3])
    gpus.push({
      name,
      ...number(columns[1]) === undefined ? {} : { utilPercent: number(columns[1]) as number },
      ...used === undefined ? {} : { memoryUsedBytes: used * MIB },
      ...total === undefined ? {} : { memoryTotalBytes: total * MIB },
      ...number(columns[4]) === undefined ? {} : { temperatureC: number(columns[4]) as number },
    })
  }
  return gpus
}

/**
 * Read the NPU section.
 *
 * There is no `nvidia-smi` for neural accelerators, so this reads the two
 * forms that exist on machines people actually attach: Ascend's `npu-smi info`
 * table, and Rockchip's `/sys/kernel/debug/rknpu/load`. Anything else is
 * reported as no NPUs — which is the same answer a machine without one gives,
 * and the destination says as much rather than drawing an empty gauge.
 * @param lines - the section's lines.
 * @returns one entry per device.
 */
export function readNpus(lines: readonly string[]): AcceleratorReading[] {
  const npus: AcceleratorReading[] = []
  for (const line of lines) {
    // Rockchip: "NPU load:  Core0:  12%, Core1:   0%,"
    if (line.startsWith('NPU load')) {
      for (const core of line.matchAll(/Core(\d+):\s*(\d+)%/gu)) {
        const util = number(core[2])
        npus.push({ name: `NPU core ${core[1] ?? '?'}`, ...util === undefined ? {} : { utilPercent: util } })
      }
      continue
    }
    // Ascend: "| 0     910B3   | OK   | 88.5  46   0     / 0    |"
    const ascend = /^\|\s*(\d+)\s+(\S+)\s*\|\s*\w+\s*\|\s*([\d.]+)\s+(\d+)\s/u.exec(line)
    if (ascend !== null) {
      const util = number(ascend[4])
      const temperature = number(ascend[3])
      npus.push({
        name: `${ascend[2] ?? 'NPU'} #${ascend[1] ?? '0'}`,
        ...util === undefined ? {} : { utilPercent: util },
        ...temperature === undefined ? {} : { temperatureC: temperature },
      })
    }
  }
  return npus
}

/**
 * Parse one command's whole output.
 * @param text - everything the command wrote to stdout.
 * @returns the machine as that poll saw it.
 */
export function readMachine(text: string): MachineReading {
  const parts = sections(text)
  return {
    ...readProcessor(parts['cpu'] ?? []),
    ...readMemory(parts['mem'] ?? []),
    ...readDisk(parts['disk'] ?? []),
    gpus: readGpus(parts['gpu'] ?? []),
    npus: readNpus(parts['npu'] ?? []),
  }
}

/**
 * The percentage of processor time spent busy between two readings.
 *
 * Undefined when there is no earlier reading to subtract, and when the two
 * carry no ticks — the first poll of a machine, and every poll of a machine
 * without `/proc`, honestly report nothing rather than a zero.
 *
 * A total that did not advance also reports nothing: two polls inside one
 * clock tick would otherwise divide by zero, and a machine that was rebooted
 * between polls presents a counter that went backwards.
 * @param previous - the earlier reading's ticks.
 * @param current - the later reading's ticks.
 * @returns the percentage, or undefined.
 */
export function busyPercent(
  previous: ProcessorTicks | undefined,
  current: ProcessorTicks | undefined,
): number | undefined {
  if (previous === undefined || current === undefined) return undefined
  const total = current.total - previous.total
  const busy = current.busy - previous.busy
  if (total <= 0 || busy < 0) return undefined
  return Math.min(100, Math.max(0, (busy / total) * 100))
}
