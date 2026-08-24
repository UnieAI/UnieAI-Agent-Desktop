/**
 * The operator-terminal registry over a fake subprocess terminal primitive.
 * Every assertion here is about what a person sitting in front of the panel
 * experiences, not about PTY mechanics — those belong to the subprocess seam.
 */
import { PassThrough } from 'node:stream'
import { Context } from '@unieai/cordis'
import type {
  SubprocessOutcome,
  SubprocessTerminalForeground,
  SubprocessTerminalHandle,
  SubprocessTerminalSignal,
  SubprocessTerminalSpawnSpec,
} from '@unieai/uad-subprocess'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorTerminalService, type Config, type ShellProbe } from '../src/index.ts'
import type { OperatorTerminalId } from '../src/types.ts'

/** One fake PTY: records what it was told and lets a test drive its output. */
class FakeTerminal implements SubprocessTerminalHandle {
  pid = 4242
  readonly output = new PassThrough()
  readonly writes: string[] = []
  readonly resizes: { cols: number; rows: number }[] = []
  readonly signals: SubprocessTerminalSignal[] = []
  terminated = 0
  private readonly outcome = Promise.withResolvers<SubprocessOutcome>()
  readonly done = this.outcome.promise

  /**
   * @param data - text to deliver as one PTY chunk.
   */
  emit(data: string): void {
    this.output.write(Buffer.from(data, 'utf8'))
  }

  /**
   * @param exitCode - code the shell exits with.
   */
  exit(exitCode = 0): void {
    this.output.end()
    this.outcome.resolve({ exitCode, signal: null })
  }

  write(data: string): Promise<void> {
    this.writes.push(data)
    return Promise.resolve()
  }

  inspectForeground(): Promise<SubprocessTerminalForeground | undefined> {
    return Promise.resolve(undefined)
  }

  signalForeground(signal: SubprocessTerminalSignal): Promise<number> {
    this.signals.push(signal)
    return Promise.resolve(this.pid)
  }

  resize(cols: number, rows: number): Promise<void> {
    this.resizes.push({ cols, rows })
    return Promise.resolve()
  }

  terminate(): Promise<void> {
    this.terminated += 1
    this.output.end()
    this.outcome.resolve({ exitCode: 0, signal: null })
    return Promise.resolve()
  }
}

/** A subprocess seam that hands out fakes and remembers every spawn spec. */
class FakeSubprocess {
  readonly spawns: SubprocessTerminalSpawnSpec[] = []
  readonly terminals: FakeTerminal[] = []

  spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    this.spawns.push(spec)
    const terminal = new FakeTerminal()
    this.terminals.push(terminal)
    return Promise.resolve(terminal)
  }
}

const PROBE: ShellProbe = { exists: path => path === '/bin/bash' || path === '/usr/bin/fish' }

/**
 * @param config - overrides for the plugin config under test.
 * @param env - environment the fake shell inherits.
 * @returns a context carrying the fake seam, plus the service under test.
 */
function bench(config: Partial<Config> = {}, env: Record<string, string | undefined> = {}): {
  ctx: Context
  subprocess: FakeSubprocess
  service: OperatorTerminalService
} {
  const ctx = new Context()
  const subprocess = new FakeSubprocess()
  ctx.provide('subprocess')
  ctx.set('subprocess', subprocess as never)
  const service = new OperatorTerminalService(
    ctx,
    { enabled: true, scrollbackMaxBytes: 1024, maxTerminalsPerWorkspace: 2, disposeGraceMs: 100, ...config },
    PROBE,
    env,
  )
  return { ctx, subprocess, service }
}

/**
 * @param spec - overrides for the open call.
 * @returns a complete open spec.
 */
function opening(spec: Partial<Parameters<OperatorTerminalService['open']>[0]> = {}): Parameters<OperatorTerminalService['open']>[0] {
  return { workspaceId: 'w1', cwd: '/work', cols: 80, rows: 24, ...spec }
}

describe('OperatorTerminalService.open', () => {
  it("runs the user's shell with NO flags so their interactive rc file loads", async () => {
    // This is the whole point of the package. `-l` would make bash read
    // ~/.bash_profile or ~/.profile and skip ~/.bashrc, which is where
    // oh-my-bash, aliases and the prompt live; a login shell would hand the
    // user a bare prompt on a machine they have configured carefully.
    const { subprocess, service } = bench({}, { SHELL: '/usr/bin/fish' })
    await service.open(opening())
    expect(subprocess.spawns[0]?.argv).toEqual(['/usr/bin/fish'])
  })

  it('starts in the workspace directory and declares a real terminal', async () => {
    const { subprocess, service } = bench({}, { SHELL: '/bin/bash', PATH: '/usr/bin' })
    await service.open(opening({ cwd: '/work/repo' }))
    const spec = subprocess.spawns[0]
    expect(spec?.cwd).toBe('/work/repo')
    expect(spec?.env?.['TERM']).toBe('xterm-256color')
    expect(spec?.env?.['PATH']).toBe('/usr/bin')
  })

  it('clamps a size a hidden or half-mounted panel reports', async () => {
    const { subprocess, service } = bench()
    const view = await service.open(opening({ cols: 0, rows: 24.7 }))
    expect(subprocess.spawns[0]).toMatchObject({ cols: 1, rows: 24 })
    expect(view).toMatchObject({ cols: 1, rows: 24, live: true })
  })

  it('refuses to open when the deployment turned the terminal off', async () => {
    const { service } = bench({ enabled: false })
    await expect(service.open(opening())).rejects.toMatchObject({ code: 'DISABLED' })
  })

  it('says so plainly when no shell is runnable', async () => {
    const { service } = bench()
    const bare = new OperatorTerminalService(
      new Context(),
      { enabled: true, scrollbackMaxBytes: 16, maxTerminalsPerWorkspace: 1, disposeGraceMs: 1 },
      { exists: () => false },
      {},
    )
    await expect(bare.open(opening())).rejects.toMatchObject({ code: 'NO_SHELL' })
    expect(service).toBeDefined()
  })

  it('bounds live terminals per workspace, not across the app', async () => {
    const { service } = bench()
    await service.open(opening())
    await service.open(opening())
    await expect(service.open(opening())).rejects.toMatchObject({ code: 'TOO_MANY_TERMINALS' })
    // A different workspace has its own budget.
    await expect(service.open(opening({ workspaceId: 'w2' }))).resolves.toMatchObject({ workspaceId: 'w2' })
  })

  it('frees a workspace slot once a shell exits', async () => {
    const { subprocess, service } = bench({ maxTerminalsPerWorkspace: 1 })
    await service.open(opening())
    subprocess.terminals[0]?.exit(0)
    await vi.waitFor(() => { expect(service.list()[0]?.live).toBe(false) })
    await expect(service.open(opening())).resolves.toMatchObject({ live: true })
  })
})

describe('OperatorTerminalService output', () => {
  let harness: ReturnType<typeof bench>
  let terminalId: OperatorTerminalId

  beforeEach(async () => {
    harness = bench()
    terminalId = (await harness.service.open(opening())).terminalId
  })

  it('publishes each chunk and retains it for a repaint', async () => {
    const chunks: string[] = []
    harness.ctx.on('operator-terminal/output', (id, chunk) => {
      expect(id).toBe(terminalId)
      chunks.push(chunk)
    })
    harness.subprocess.terminals[0]?.emit('$ ls\r\n')
    harness.subprocess.terminals[0]?.emit('README.md\r\n')
    await vi.waitFor(() => { expect(chunks).toEqual(['$ ls\r\n', 'README.md\r\n']) })
    expect(harness.service.replay(terminalId)).toBe('$ ls\r\nREADME.md\r\n')
  })

  it('announces the exit once and keeps the scrollback readable after it', async () => {
    const exits: (number | undefined)[] = []
    harness.ctx.on('operator-terminal/exited', (_id, exitCode) => exits.push(exitCode))
    harness.subprocess.terminals[0]?.emit('bye\r\n')
    harness.subprocess.terminals[0]?.exit(3)
    await vi.waitFor(() => { expect(exits).toEqual([3]) })
    expect(harness.service.list()[0]).toMatchObject({ live: false, exitCode: 3 })
    expect(harness.service.replay(terminalId)).toBe('bye\r\n')
  })
})

describe('OperatorTerminalService input', () => {
  it('delivers keystrokes verbatim, adding no newline of its own', async () => {
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    await service.write(terminalId, 'ls -la')
    await service.write(terminalId, '\r')
    expect(subprocess.terminals[0]?.writes).toEqual(['ls -la', '\r'])
  })

  it('forwards a clamped resize and remembers the new size', async () => {
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    await service.resize(terminalId, 120.9, 0)
    expect(subprocess.terminals[0]?.resizes).toEqual([{ cols: 120, rows: 1 }])
    expect(service.list()[0]).toMatchObject({ cols: 120, rows: 1 })
  })

  it('signals the foreground group, which is what Ctrl-C means', async () => {
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    await service.signal(terminalId, 'SIGINT')
    expect(subprocess.terminals[0]?.signals).toEqual(['SIGINT'])
  })

  it('degrades SIGQUIT to SIGTERM rather than failing the keystroke', async () => {
    // The seam permits no SIGQUIT. A terminal offers Ctrl-\, so the closest
    // deliverable signal is better than an error the user cannot act on.
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    await service.signal(terminalId, 'SIGQUIT')
    expect(subprocess.terminals[0]?.signals).toEqual(['SIGTERM'])
  })

  it('refuses input to a shell that has exited', async () => {
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    subprocess.terminals[0]?.exit(0)
    await vi.waitFor(() => { expect(service.list()[0]?.live).toBe(false) })
    await expect(service.write(terminalId, 'x')).rejects.toMatchObject({ code: 'EXITED' })
    await expect(service.resize(terminalId, 10, 10)).rejects.toMatchObject({ code: 'EXITED' })
  })

  it('names an unknown terminal rather than failing anonymously', async () => {
    const { service } = bench()
    await expect(service.write('operator-99' as OperatorTerminalId, 'x'))
      .rejects.toMatchObject({ code: 'NO_TERMINAL' })
    expect(() => service.replay('operator-99' as OperatorTerminalId)).toThrow(/operator-99/)
  })
})

describe('OperatorTerminalService lifecycle', () => {
  it('publishes the whole list whenever it changes', async () => {
    const { ctx, service } = bench()
    const lists: number[] = []
    ctx.on('operator-terminal/changed', terminals => lists.push(terminals.length))
    const { terminalId } = await service.open(opening())
    await service.open(opening())
    await service.close(terminalId)
    expect(lists).toEqual([1, 2, 1])
  })

  it('closes idempotently and forgets the scrollback', async () => {
    const { subprocess, service } = bench()
    const { terminalId } = await service.open(opening())
    subprocess.terminals[0]?.emit('secret')
    await service.close(terminalId)
    await service.close(terminalId)
    expect(subprocess.terminals[0]?.terminated).toBe(1)
    expect(service.list()).toEqual([])
  })

  it('terminates every terminal when its scope disposes', async () => {
    const ctx = new Context()
    const subprocess = new FakeSubprocess()
    ctx.provide('subprocess')
    ctx.set('subprocess', subprocess as never)
    const fork = ctx.plugin({
      inject: ['subprocess'],
      apply(scope: Context) {
        const service = new OperatorTerminalService(
          scope,
          { enabled: true, scrollbackMaxBytes: 64, maxTerminalsPerWorkspace: 4, disposeGraceMs: 10 },
          PROBE,
          {},
        )
        void service.open(opening())
        void service.open(opening({ workspaceId: 'w2' }))
      },
    })
    await fork.await()
    await vi.waitFor(() => { expect(subprocess.terminals).toHaveLength(2) })
    await fork.dispose()
    await vi.waitFor(() => {
      for (const terminal of subprocess.terminals) expect(terminal.terminated).toBe(1)
    })
  })
})
