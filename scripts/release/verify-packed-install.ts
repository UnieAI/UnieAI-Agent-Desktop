/**
 * Install packed tarballs into a throwaway consumer outside the repository and
 * drive the installed executable with plain Node.
 *
 * Every tarball the installed tree needs comes from `--from`, so the only
 * registry traffic is for external dependencies. That matters beyond hermetic
 * verification: the harness packages declare the vendored framework as a peer,
 * those packages live in another release sequence, and this job must not depend
 * on the registry already carrying versions that match — one pull request may
 * bump both families before either publishes — so a dsh verification passes the
 * vendored family's pack output too, while publishing only its own
 * ([rationale](../../.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md)).
 *
 * What this proves is that `files` selected a complete payload and that the
 * published dependency ranges resolve. A workspace link or a stale `lib/` in the
 * checkout cannot stand in for a missing file here.
 *
 * IT BOOTS THE TREE, not just the binary. `--version` returns before the loader
 * mounts anything, so a package whose entry cannot import its own chunk passes
 * it — which is how `@unieai/uad-execution-router` shipped twice unable to
 * import `lib/types-<hash>.js`, a chunk `files` never published. The boot step
 * applies every entry in the composition, which is where that surfaces.
 */

import { spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { capture, isEntry } from './process.ts'
import { packedIdentity } from './tarball.ts'

/** How long the installed tree has to announce its address before this fails. */
const BOOT_TIMEOUT_MS = 120_000

/**
 * Environment for the installed artifact: no host Node hooks, no host DeepSeek
 * Harness home, and no ambient npm user agent that would confuse npm.
 * @param consumerRoot - the throwaway consumer directory.
 * @returns The child environment.
 */
function consumerEnvironment(consumerRoot: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.npm_config_user_agent
  delete environment.NPM_CONFIG_USER_AGENT
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  environment.DSH_HOME = resolve(consumerRoot, '.dsh')
  environment.DSH_AGENTS_HOME = resolve(consumerRoot, '.agents')
  environment.DSH_TELEMETRY_DISABLED = '1'
  return environment
}

/**
 * Every packed tarball in the given directories, as `file:` dependency entries.
 *
 * The directories are read by their contents rather than a pack order file: a
 * directory here can hold tarballs packed only to satisfy a cross-sequence
 * dependency, which no release order describes.
 * @param directories - absolute directories holding packed tarballs.
 * @returns Package name to tarball file URL, and the version each carries.
 */
function packedDependencies(directories: readonly string[]): Map<string, { url: string; version: string }> {
  const dependencies = new Map<string, { url: string; version: string }>()
  for (const directory of directories) {
    const tarballs = readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()
    if (tarballs.length === 0) throw new Error(`${directory} holds no packed tarball`)
    for (const filename of tarballs) {
      const tarball = join(directory, filename)
      const { name, version } = packedIdentity(tarball)
      dependencies.set(name, { url: pathToFileURL(tarball).href, version })
    }
  }
  return dependencies
}

/** Install every tarball under `--from` and drive the `--family` entry. */

/**
 * Boot the installed tree far enough to apply every loader entry.
 *
 * The web profile is the composition this product ships, so it is the one whose
 * entries must all import. Port 0 lets the OS pick, `--no-open` keeps a browser
 * out of a release job, and the child is killed as soon as it announces its
 * address — the question is whether the tree mounts, not whether it serves.
 *
 * The child writes to a FILE and this polls it with synchronous reads. Every
 * other step here is blocking, and a blocking wait starves the event loop, so
 * `stdout.on('data')` would never fire: the first version of this check timed
 * out with an empty transcript against a tree that boots fine.
 *
 * A DSH home inside the throwaway consumer keeps the run from reading or
 * healing the operator's own `~/.dsh`.
 * @param consumerRoot - the throwaway consumer directory.
 * @param bin - absolute path of the installed executable.
 * @param environment - the child environment.
 */
function verifyTreeBoots(consumerRoot: string, bin: string, environment: NodeJS.ProcessEnv): void {
  const logPath = join(consumerRoot, 'boot.log')
  const log = openSync(logPath, 'w')
  const child = spawn(process.execPath, [bin, 'web', '--no-open', '--port', '0'], {
    cwd: consumerRoot,
    env: { ...environment, DSH_HOME: join(consumerRoot, 'dsh-home') },
    stdio: ['ignore', log, log],
  })
  closeSync(log)

  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let booted = false
  let alive = true
  while (alive && Date.now() < deadline) {
    booted = /http:\/\/127\.0\.0\.1:\d+/u.test(readFileSync(logPath, 'utf8'))
    if (booted) break
    try {
      // Signal 0 tests for the process without touching it.
      if (child.pid !== undefined) process.kill(child.pid, 0)
      else alive = false
    } catch {
      alive = false
    }
    if (alive) sleepSync(250)
  }
  if (child.pid !== undefined && alive) child.kill('SIGTERM')

  if (!booted) {
    throw new Error(
      `release verify-packed-install: the installed tree did not boot within ${String(BOOT_TIMEOUT_MS / 1000)}s.\n`
      + readFileSync(logPath, 'utf8'),
    )
  }
  console.log('release verify-packed-install: the installed tree boots and applies every loader entry')
}

/**
 * Block this thread for a while, without a subprocess or a busy loop.
 * @param ms - milliseconds to wait.
 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function main(): void {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string', multiple: true } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined || values.from.length === 0) {
    throw new Error('usage: verify-packed-install.ts --family <dsh|vendor> --from <packed directory> [--from ...]')
  }

  const family = releaseFamily(values.family)
  const entry = family.installedEntry
  if (entry === undefined) {
    console.log(`release verify-packed-install: family ${family.id} publishes no executable, nothing to drive`)
    return
  }

  const root = process.cwd()
  const packed = packedDependencies(values.from.map(directory => resolve(root, directory)))
  const expected = packed.get(entry.packageName)
  if (expected === undefined) throw new Error(`${entry.packageName} is not among the packed tarballs`)

  const consumerRoot = mkdtempSync(join(tmpdir(), `dsh-packed-${family.id}-`))
  try {
    writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
      name: `dsh-packed-install-${family.id}`,
      version: '0.0.0',
      private: true,
      dependencies: Object.fromEntries([...packed].map(([name, entryPacked]) => [name, entryPacked.url])),
    }, null, 2)}\n`)

    const environment = consumerEnvironment(consumerRoot)
    console.log(`release verify-packed-install: installing ${String(packed.size)} tarball(s) into ${consumerRoot}`)
    // Optional dependencies are INCLUDED, because a real consumer installs
    // them: npm fetches the ones whose `os`/`cpu` match and silently skips the
    // rest, which is what optional means. Omitting them made this tree stricter
    // than any user's — `sharp` lost its platform binary and the boot step
    // below failed on a library no product change had touched. The Landlock
    // platform packages are published per architecture, so a runner installs
    // its own or none; their entry package is a plain dependency of
    // dsh-sandbox-local and its tarball is supplied through --from.
    capture('npm', ['install', '--no-audit', '--no-fund', '--package-lock=false'],
      { cwd: consumerRoot, env: environment })

    const bin = join(consumerRoot, 'node_modules', ...entry.packageName.split('/'), entry.binPath)
    const version = capture(process.execPath, [bin, '--version'], { cwd: consumerRoot, env: environment })
    if (version !== expected.version) {
      throw new Error(`installed ${entry.packageName} --version reported ${JSON.stringify(version)}, expected ${expected.version}`)
    }
    console.log(`release verify-packed-install: installed ${entry.packageName} reports ${version}`)
    verifyTreeBoots(consumerRoot, bin, environment)
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) main()
