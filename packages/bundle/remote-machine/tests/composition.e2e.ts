/**
 * The whole product, on a machine.
 *
 * Every other suite proves a seam. This one proves the composition: the real
 * headless agent, the real Bash tool, and a keyless model that issues one
 * command reporting where it ran. The evidence is deliberately on BOTH
 * sides — the transcript says where the command believed it was, and a file
 * on the machine, read over a separate connection, says the work actually
 * happened there. A transcript alone could be produced by a local run.
 *
 * Set `DSH_SSH_TEST_CONFIG` and `DSH_SSH_TEST_ALIAS`; see
 * `packages/ssh/ssh/tests/live-connection.e2e.ts` for the disposable server.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runLoaderSmoke } from '@unieai/uad-loader-smoke'

const run = promisify(execFile)
const CONFIG = process.env['DSH_SSH_TEST_CONFIG']
const ALIAS = process.env['DSH_SSH_TEST_ALIAS']
const ready = CONFIG !== undefined && ALIAS !== undefined

const binScript = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/headless-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/ssh/ssh.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

/** Read one file from the machine, outside the harness entirely. */
async function onMachine(path: string): Promise<string> {
  const { stdout } = await run('ssh', ['-F', CONFIG as string, '-T', ALIAS as string, '--', `cat ${path} 2>/dev/null; rm -f ${path}`], { encoding: 'utf8' })
  return stdout
}

describe.skipIf(!ready)('the harness composed onto a machine', () => {
  it('runs the agent\'s command there, and leaves the proof there', async () => {
    const marker = `/tmp/dsh-remote-machine-smoke-${String(process.pid)}.txt`
    const result = await runLoaderSmoke({
      label: 'remote-machine composition',
      tempDirPrefix: 'remote-machine-smoke-',
      binScript,
      configPath,
      binArgs: [configPath, 'where are you running'],
      tsconfigPath,
      env: {
        DSH_SSH_CONFIG: CONFIG,
        DSH_SSH_MACHINE: ALIAS,
        DSH_SSH_CWD: '/tmp',
        DSH_SSH_SMOKE_MARKER: marker,
        DSH_PERMISSION_MODE: 'danger-full-access',
        DSH_TELEMETRY_DISABLED: '1',
      },
    })

    // The agent's own answer: the command reported the machine and the
    // remote working directory the composition pinned.
    expect(result.stdout).toContain('"output":"ran on ')
    expect(result.stdout).toContain(':/tmp"')

    // And the machine kept the receipt.
    expect(await onMachine(marker)).toMatch(/^\S+:\/tmp$/)
  }, 120_000)
})
