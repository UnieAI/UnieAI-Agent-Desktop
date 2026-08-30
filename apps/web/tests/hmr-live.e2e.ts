/** Published rabi web + pnpm dev:web → browser HMR, with no page reload. */

import { existsSync, globSync, statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import type { Fiber } from '@unieai/cordis'
import LocalSubprocessRuntime from '@unieai/uad-subprocess-local'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@unieai/uad-subprocess'
import { readClientBuildRecord } from '../../../scripts/client-build-environment.ts'
import { REPO_ROOT } from './support.ts'

function spawnSpec(argv: readonly string[], cwd: string, env?: Record<string, string>): SubprocessSpawnSpec {
  return {
    argv,
    cwd,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 5_000,
    ...env === undefined ? {} : { env },
  }
}

function waitForOutput(child: SubprocessHandle, pattern: RegExp, label: string): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let output = ''
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
    }
    const resolveOnce = (value: string): void => {
      if (settled) return
      settled = true
      cleanup()
      resolveReady(value)
    }
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      const match = pattern.exec(output)
      if (match === null) return
      resolveOnce(match[1] ?? match[0])
    }
    const timer = setTimeout(() => { rejectOnce(new Error(`${label} not ready:\n${output}`)) }, 60_000)
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    void child.done.then((outcome) => {
      rejectOnce(new Error(`${label} exited before ready (${JSON.stringify(outcome)}):\n${output}`))
    }, (error: unknown) => {
      rejectOnce(new Error(`${label} failed before ready:\n${output}`, { cause: error }))
    })
  })
}

async function stopTree(child: SubprocessHandle): Promise<void> {
  child.terminate()
  const stopped = await child.waitForExit(AbortSignal.timeout(15_000))
  if (!stopped) throw new Error(`process tree ${String(child.pid)} did not stop after termination escalation`)
  await child.done
}

it('hot-reloads a real client-plugin source edit without refreshing the page', async () => {
  const world = await mkdtemp(join(tmpdir(), 'dsh-web-hmr-world-'))
  const ARTIFACT_PATTERNS = [
    'packages/*/*/lib/client.js', 'packages/*/*/lib/client.js.map', 'apps/web/dist/**/*',
  ]
  const GATE_OVERLAY = fileURLToPath(new URL('./hmr-live.overlay.yml', import.meta.url))
  const sourcePath = join(REPO_ROOT, 'packages/client/ui-conversation/src/client/locales.ts')
  const binPath = join(REPO_ROOT, 'apps/cli/lib/bin.js')
  if (!existsSync(binPath)) throw new Error('HMR browser test needs the built dsh bin; run pnpm run build first')
  const clientBuildEnvironment = readClientBuildRecord(REPO_ROOT).environment
  // Everything the build RECORD covers, not just the plugin bundles: `dev:web`
  // rebuilds `apps/web/dist` from the edited source too, and a restore that
  // leaves it rebuilt makes the next consumer of the record fail with
  // "client artifacts differ" — which is not this scenario's business to cause.
  const clientBundlePaths = [
    ...globSync(ARTIFACT_PATTERNS, { cwd: REPO_ROOT })
      .map(path => join(REPO_ROOT, path)).filter(path => statSync(path).isFile()),
  ]
  const originalClientBundles = await Promise.all(clientBundlePaths.map(async path => [path, await readFile(path)] as const))
  const originalSource = await readFile(sourcePath)
  const oldText = 'What do you want to do in your workspace?'
  const sourceNeedle = "'hero.headline': 'What do you want to do in your workspace?'"
  const newText = `HMR UPDATED ${'x'.repeat(80)}`
  const updatedSource = originalSource.toString().replace(sourceNeedle, `'hero.headline': '${newText}'`)
  if (updatedSource === originalSource.toString()) throw new Error(`HMR source lacks ${JSON.stringify(sourceNeedle)}`)

  const subprocessCtx = new Context()
  let subprocessFiber: Fiber | undefined
  let watcher: SubprocessHandle | undefined
  let host: SubprocessHandle | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const failures: unknown[] = []
  try {
    subprocessFiber = await subprocessCtx.plugin(LocalSubprocessRuntime)
    watcher = subprocessCtx.subprocess.spawn(spawnSpec(
      ['pnpm', 'run', 'dev:web'],
      REPO_ROOT,
      { ...clientBuildEnvironment },
    ))
    await waitForOutput(watcher, /dev-web: watching/, 'pnpm run dev:web')
    host = subprocessCtx.subprocess.spawn(spawnSpec(
      // `--patch` is a LAUNCHER flag, so it precedes the profile's own args.
      [process.execPath, binPath, '--profile', 'web', '--patch', GATE_OVERLAY, '--no-open', '--port', '0'],
      world,
      {
        DEEPSEEK_API_KEY: 'keyless-hmr-no-call',
        DSH_HOME: join(world, '.dsh'),
      },
    ))
    const baseUrl = await waitForOutput(host, /rabi web: (http:\/\/[^\s]+)/, 'built rabi web')
    browser = await chromium.launch()
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto(baseUrl, { waitUntil: 'load' })
    await page.getByText(oldText, { exact: true }).waitFor({ timeout: 15_000 })
    const pageIdentity = await page.evaluate(() => {
      const identity = crypto.randomUUID()
      Object.defineProperty(window, '__dshHmrPageIdentity', { value: identity })
      return identity
    })

    await writeFile(sourcePath, updatedSource)
    await page.getByText(newText, { exact: true }).waitFor({ timeout: 30_000 })
    expect(await page.evaluate(() => (window as Window & { __dshHmrPageIdentity?: string }).__dshHmrPageIdentity))
      .toBe(pageIdentity)
    expect(pageErrors).toEqual([])
  } catch (error) {
    failures.push(error)
  } finally {
    // Watcher FIRST. Restoring the source while `dev:web` is still watching
    // starts one more rebuild, and that rebuild lands on top of the bundles
    // restored below — leaving this package's client.js rewritten and the next
    // consumer of the build record failing with "client artifacts differ".
    if (watcher !== undefined) await stopTree(watcher).catch((error: unknown) => failures.push(error))
    await writeFile(sourcePath, originalSource).catch((error: unknown) => failures.push(error))
    await Promise.all(originalClientBundles.map(async ([path, content]) => {
      await writeFile(path, content).catch((error: unknown) => failures.push(error))
    }))
    // A Vite rebuild emits content-hashed chunk names, so restoring the
    // original bytes is not enough: the new chunks are extra FILES, and the
    // build record counts files. Anything the rebuild added comes back out.
    const restored = new Set(originalClientBundles.map(([path]) => path))
    for (const path of globSync(ARTIFACT_PATTERNS, { cwd: REPO_ROOT }).map(rel => join(REPO_ROOT, rel))) {
      if (restored.has(path) || !statSync(path).isFile()) continue
      await rm(path, { force: true }).catch((error: unknown) => failures.push(error))
    }

    if (host !== undefined) await stopTree(host).catch((error: unknown) => failures.push(error))
    await browser?.close().catch((error: unknown) => failures.push(error))
    await subprocessFiber?.dispose().catch((error: unknown) => failures.push(error))
    await rm(world, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
  }
  if (failures.length > 0) throw new AggregateError(failures, 'HMR browser test or cleanup failed')
}, 120_000)
