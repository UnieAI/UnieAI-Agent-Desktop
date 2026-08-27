/**
 * One execution world, not two.
 *
 * The seam's central promise is that a filesystem provider and a subprocess
 * provider mounted together describe the same machine: a file the tools
 * write is a file the commands can run, and a file a command produces is one
 * the tools can read. Mounted with mismatched providers that promise silently
 * fails, and every capability above them — Bash, the editor, search, the
 * language servers — inherits the confusion.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { SshHosts } from '@unieai/uad-ssh'
import { SshSubprocessRuntime } from '@unieai/uad-subprocess-ssh'
import { SshFileSystem } from '../src/index.ts'

const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined
const ROOT = `/tmp/dsh-one-world-${randomUUID()}`

let ctx: Context
let fs: SshFileSystem
let subprocess: SshSubprocessRuntime

/** Collected stdio for a test command. */
const COLLECT = { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } as const

/** Run one command through the subprocess seam and collect its stdout. */
async function command(argv: string[], cwd = ROOT): Promise<string> {
  const handle = subprocess.spawn({ argv, cwd, stdio: COLLECT, graceMs: 1500 })
  await handle.done
  return handle.collected.stdout?.readFrom(0).text ?? ''
}

beforeAll(async () => {
  if (!ready) return
  ctx = new Context()
  const hosts = new SshHosts(ctx, {})
  const original = hosts.argvFor.bind(hosts)
  hosts.argvFor = (alias, line, options) => {
    const argv = original(alias, line, options)
    return [argv[0] as string, '-F', CONFIG as string, ...argv.slice(1)]
  }
  await hosts.ensureControlDir()
  subprocess = new SshSubprocessRuntime(ctx, { machine: ALIAS as string })
  fs = new SshFileSystem(ctx, { machine: ALIAS as string, cwd: ROOT })
  await command(['mkdir', '-p', ROOT], '/tmp')
})

afterAll(async () => {
  if (!ready) return
  await command(['rm', '-rf', ROOT], '/tmp')
})

describe.skipIf(!ready)('the filesystem and the subprocess seam over one machine', () => {
  it('runs what the file tools wrote', async () => {
    const script = await fs.resolve('greet.sh')
    await fs.writeText(script, '#!/bin/sh\necho written-then-run\n')
    expect(await command(['sh', 'greet.sh'])).toBe('written-then-run\n')
  })

  it('reads what a command produced, with the metadata the tools show', async () => {
    await command(['sh', '-c', 'printf produced > made-by-command.txt'])
    const target = await fs.resolve('made-by-command.txt')
    expect(await fs.readText(target)).toBe('produced')
    expect((await fs.stat(target))?.size).toBe(8)
  })

  it('agrees on paths, so a target can be handed to a command', async () => {
    const target = await fs.resolve('made-by-command.txt')
    // processPath exists precisely so one capability can hand a path to
    // another; it must name the file on the machine both are using.
    expect(await command(['cat', fs.processPath(target)])).toBe('produced')
  })

  it('sees an edit the other side made, in both directions', async () => {
    const target = await fs.resolve('shared.txt')
    await fs.writeText(target, 'from the tools\n')
    expect(await command(['cat', 'shared.txt'])).toBe('from the tools\n')

    await command(['sh', '-c', 'printf "from the shell\\n" > shared.txt'])
    expect(await fs.readText(target)).toBe('from the shell\n')
  })
})
