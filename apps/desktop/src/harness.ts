/**
 * Starting the harness this window talks to, and knowing when it is ready.
 *
 * The desktop app is a window over a local server, not a reimplementation of
 * one: it starts the same `dsh web` the terminal starts and loads the URL that
 * server reports. So the shell's job is narrow — start it, learn its address,
 * and take it down again — and every product behaviour stays in the harness
 * where the rest of this repository already tests it.
 *
 * READINESS IS THE URL LINE, NOT A TIMER. `dsh web` prints
 * `dsh web: http://127.0.0.1:<port>` only after the Loader has settled, and
 * that line exists to be watched: `packages/bundle/web-app/src/index.ts`
 * documents it as the signal supervisors wait for before they call in. A shell
 * that instead slept and hoped would show an error page whenever a machine was
 * slower than the guess, and would show a blank window when the server failed
 * to start at all.
 *
 * THE PORT IS THE OS'S CHOICE. `--port 0` binds an ephemeral loopback port and
 * the URL line reports the one that was actually taken. A fixed port would
 * collide with a developer already running `dsh web`, and picking a number at
 * random in this process would only move the collision somewhere less visible.
 *
 * THE HOME DIRECTORY IS THE APP'S OWN. `DSH_HOME` decides where profiles,
 * credentials and sessions live; pointing it at the packaged app's own data
 * directory keeps an installed copy from writing into a checkout's `~/.dsh`
 * and vice versa. Two installations of this app share nothing but the machine.
 */

import { utilityProcess, type UtilityProcess } from 'electron'
import { createRequire } from 'node:module'

/** How the harness announces the address it actually bound. */
const URL_LINE = /^dsh web: (http:\/\/\S+)/mu

/**
 * How long to wait for that line before giving up.
 *
 * Generous on purpose: the first start of an installed copy initialises a
 * profile directory, and a cold machine is slow. What this bounds is a harness
 * that will never answer at all — the window must say so rather than sit blank.
 */
const READY_TIMEOUT_MS = 120_000

/** A harness process that has announced its address. */
export interface RunningHarness {
  /** The loopback URL the window should load. */
  url: string
  /** Stop the harness. Safe to call more than once. */
  stop: () => void
}

/** Why a start attempt produced no address. */
export class HarnessStartError extends Error {
  /**
   * @param message - what went wrong, in one line.
   * @param output - everything the harness wrote before it stopped, so the
   *   failure window can show the reason instead of the fact of failure.
   */
  constructor(message: string, readonly output: string) {
    super(message)
    this.name = 'HarnessStartError'
  }
}

/** What {@link startHarness} needs from its surroundings. */
export interface HarnessEnvironment {
  /** Directory to point `DSH_HOME` at. */
  home: string
  /**
   * Absolute path of the harness CLI entry.
   *
   * Supplied rather than resolved here so a test can drive a stub, and so the
   * packaged app can name the path its own layout puts the CLI at.
   */
  entry?: string
}

/**
 * Resolve the harness CLI entry inside this app.
 * @returns absolute path of `dsh`'s built bin.
 */
export function resolveHarnessEntry(): string {
  const require = createRequire(import.meta.url)
  // The bin, not a package export: `@unieai/uad` publishes `lib/*.js` and
  // declares no `exports` map, so the bin path is the only stable entry.
  return require.resolve('@unieai/uad/lib/bin.js')
}

/**
 * Start the harness and wait for it to report its address.
 *
 * Runs in Electron's own utility process rather than a spawned `node`: a
 * packaged app ships no separate Node binary, and the utility process is the
 * Node environment Electron already carries. Its stdout is piped because the
 * URL line is the readiness signal.
 * @param environment - see {@link HarnessEnvironment}.
 * @returns the running harness, once it has announced its URL.
 */
export async function startHarness(environment: HarnessEnvironment): Promise<RunningHarness> {
  const entry = environment.entry ?? resolveHarnessEntry()
  const child: UtilityProcess = utilityProcess.fork(
    entry,
    ['web', '--no-open', '--port', '0'],
    {
      stdio: 'pipe',
      env: { ...process.env, DSH_HOME: environment.home },
      // The harness watches the user's own patch layer through Cordis HMR, and
      // HMR needs Node's internal module loader. `vendor/loader` reaches it two
      // ways: this flag, or the `node-addon-require-builtin` native addon. The
      // addon is built for Node's ABI and does not load inside Electron, so
      // without the flag both routes are closed and the harness dies AFTER
      // printing its URL — the server bound, then the process exited 1.
      //
      // The flag is the documented first route in that same function, not a way
      // around it.
      execArgv: ['--expose-internals'],
    },
  )

  let output = ''
  let settled = false
  const stop = (): void => {
    if (!child.kill()) return
  }

  return await new Promise<RunningHarness>((resolve, reject) => {
    const finish = (run: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      run()
    }

    const timer = setTimeout(() => {
      finish(() => {
        stop()
        reject(new HarnessStartError(
          `the harness did not report an address within ${String(READY_TIMEOUT_MS / 1000)}s`,
          output,
        ))
      })
    }, READY_TIMEOUT_MS)

    const read = (chunk: Buffer | string): void => {
      output += String(chunk)
      const match = URL_LINE.exec(output)
      if (match?.[1] === undefined) return
      const url = match[1]
      finish(() => { resolve({ url, stop }) })
    }
    child.stdout?.on('data', read)
    // stderr is watched too: a harness that fails during boot explains itself
    // there, and that explanation is what the failure window has to show.
    child.stderr?.on('data', (chunk: Buffer | string) => { output += String(chunk) })

    child.on('exit', (code) => {
      finish(() => {
        reject(new HarnessStartError(`the harness stopped before it was ready (exit ${String(code)})`, output))
      })
    })
  })
}
