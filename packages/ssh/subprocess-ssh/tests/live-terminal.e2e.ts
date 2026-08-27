/**
 * A terminal on a real machine.
 *
 * The delegated half — bytes, resize, lifetime — is the local PTY's and is
 * exercised by the local provider's own suite. What only a real machine can
 * settle is the half that must NOT be delegated: that the foreground group
 * reported is the remote one, that an interrupt reaches the remote command
 * rather than the client, and that ending the session ends the remote shell.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`.
 */
import { setTimeout as sleepMs } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '@unieai/uad-ssh'
import { SshSubprocessRuntime } from '../src/index.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

/** Collected stdio for the checks run beside a session. */
const COLLECT = { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } as const

/** A provider whose client always reads the test configuration file. */
async function provider(): Promise<SshSubprocessRuntime> {
  const ctx = new Context()
  const hosts = new SshHosts(ctx, {})
  const original = hosts.argvFor.bind(hosts)
  hosts.argvFor = (alias, line, options) => {
    const argv = original(alias, line, options)
    return [argv[0] as string, '-F', CONFIG as string, ...argv.slice(1)]
  }
  await hosts.ensureControlDir()
  return new SshSubprocessRuntime(ctx, { machine: ALIAS as string })
}

/** Run one command beside the session and read its stdout. */
async function beside(runtime: SshSubprocessRuntime, argv: string[]): Promise<string> {
  const handle = runtime.spawn({ argv, cwd: '/tmp', stdio: COLLECT, graceMs: 1500 })
  await handle.done
  return handle.collected.stdout?.readFrom(0).text ?? ''
}

/**
 * Wait until no process on the machine runs a command matching `pattern`.
 *
 * Polled, and matched by exact field comparison: a `grep` for the pattern
 * can match the very command doing the looking, and a fixed sleep either
 * flakes on a busy machine or slows every run.
 */
async function goneFromMachine(runtime: SshSubprocessRuntime, pattern: string): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const text = await beside(runtime, ['sh', '-c',
      `ps -eo args= | awk -v p='${pattern}' 'index($0, p) == 1' | wc -l`])
    if (Number(text.trim()) === 0) return 0
    await sleepMs(500)
  }
  return -1
}

/** Open an interactive shell on the machine. */
async function session(runtime: SshSubprocessRuntime) {
  return runtime.spawnTerminal({
    argv: ['/bin/sh', '-i'], cwd: '/tmp', rows: 24, cols: 80, graceMs: 1000,
  })
}

describe.skipIf(!ready)('a terminal on a real machine', () => {
  it('runs the shell there, and its output comes back', async () => {
    const runtime = await provider()
    const terminal = await session(runtime)
    let text = ''
    terminal.output.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
    try {
      await terminal.write('echo terminal-is-remote; hostname\n')
      await sleepMs(1500)
      expect(text).toContain('terminal-is-remote')
    } finally {
      await terminal.terminate()
    }
  })

  it('reports the REMOTE foreground group, not the ssh client', async () => {
    const runtime = await provider()
    const terminal = await session(runtime)
    try {
      await terminal.write('sleep 87 &\nsleep 88\n')
      await sleepMs(1500)
      const foreground = await terminal.inspectForeground()
      expect(foreground?.processGroupId).toBeGreaterThan(0)

      // The group named must be a group that exists on the MACHINE and
      // contains the command the person is running.
      // Selected by filtering, not with `ps -g`: that flag selects by session
      // on Linux and silently answers nothing for a process-group id.
      const members = await beside(runtime, ['sh', '-c',
        `ps -eo pgid=,args= | awk -v g=${String(foreground?.processGroupId)} '$1==g'`])
      expect(members).toContain('sleep 88')
      expect(members).not.toContain('ssh')
    } finally {
      await terminal.terminate()
    }
  })

  it('proves when the shell is waiting for input, which is what readiness reads', async () => {
    const runtime = await provider()
    const terminal = await session(runtime)
    try {
      await sleepMs(1500)
      const idle = await terminal.inspectForeground()
      expect(idle?.inputWaiting).toBe(true)

      await terminal.write('sleep 5\n')
      await sleepMs(1000)
      const busy = await terminal.inspectForeground()
      expect(busy?.inputWaiting).toBe(false)
    } finally {
      await terminal.terminate()
    }
  })

  it('interrupts the remote command without ending the session', async () => {
    const runtime = await provider()
    const terminal = await session(runtime)
    let text = ''
    terminal.output.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
    try {
      await terminal.write('sleep 91\n')
      await sleepMs(1500)
      await terminal.signalForeground('SIGINT')
      await sleepMs(1500)

      // The command is gone from the machine...
      expect(await goneFromMachine(runtime, 'sleep 91')).toBe(0)
      // ...and the shell is still there to take the next command.
      await terminal.write('echo still-here\n')
      await sleepMs(1200)
      expect(text).toContain('still-here')
    } finally {
      await terminal.terminate()
    }
  })

  it('ends the remote shell when the session is terminated', async () => {
    const runtime = await provider()
    const terminal = await session(runtime)
    await terminal.write('sleep 92 &\n')
    await sleepMs(1500)
    await terminal.terminate()
    expect(await goneFromMachine(runtime, 'sleep 92')).toBe(0)
  })
})
