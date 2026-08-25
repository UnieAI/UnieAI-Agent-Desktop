/**
 * Finding the browser this machine already has.
 * @module @unieai/uad-browser-operator/chrome
 */

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Environment variable naming a browser explicitly.
 *
 * First and unconditional: a deployment that names one has a reason, and a
 * search that could overrule it would be this package deciding it knows the
 * machine better than its operator does.
 */
export const CHROME_PATH_VARIABLE = 'RABI_CHROME'

/**
 * Where a Chromium-family browser usually lives, per platform.
 *
 * Chrome first, then Chromium, then Edge — the order is which is most likely
 * to be the browser this person actually uses, not which is most likely to
 * exist. A profile is never touched either way (see the launch flags), so the
 * choice costs them nothing but familiarity.
 */
const WELL_KNOWN: Readonly<Record<string, readonly string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

/**
 * Relative path from a Playwright browser directory to its executable.
 *
 * Playwright's cache is searched LAST and on purpose. Someone who has run the
 * repository's browser tests already has a Chromium on disk, and asking them
 * to install a second one to look at a web page would be this package
 * ignoring what is in front of it. It is last because it is a build artifact
 * of something else: a browser they chose always outranks one a test suite
 * left behind.
 */
const PLAYWRIGHT_EXECUTABLES = [
  join('chrome-linux64', 'chrome'),
  join('chrome-linux', 'chrome'),
  join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  join('chrome-win', 'chrome.exe'),
] as const

/** Filesystem probe used to find a browser; injectable for tests. */
export interface ChromeProbe {
  /**
   * @param path - absolute path to test.
   * @returns whether an executable file is present there.
   */
  exists(path: string): boolean
  /**
   * @param path - absolute directory to list.
   * @returns its entries, or an empty list when it cannot be read.
   */
  list(path: string): readonly string[]
  /**
   * Locate one carried-browser package's manifest.
   *
   * Part of the probe rather than a bare `require.resolve` so a test can say
   * which platform payloads are installed. A machine that has none is the
   * ordinary case, not a fault.
   * @param specifier - the package's `chromium.json` specifier.
   * @returns absolute path of the manifest, or undefined when absent.
   */
  manifest(specifier: string): string | undefined
  /**
   * Read one carried-browser manifest.
   * @param path - absolute path the probe just resolved.
   * @returns its parsed contents, or undefined when unreadable.
   */
  readManifest(path: string): { executable?: unknown } | undefined
}

/**
 * Choose the browser to drive.
 * @param env - environment to read {@link CHROME_PATH_VARIABLE} from.
 * @param platform - `process.platform`.
 * @param probe - filesystem probe.
 * @param arch - `process.arch`; only the carried payload is chosen by it.
 * @returns the executable path, or undefined when this machine has none.
 */
export function resolveChrome(
  env: Record<string, string | undefined>,
  platform: string,
  probe: ChromeProbe,
  arch: string = process.arch,
): string | undefined {
  const named = env[CHROME_PATH_VARIABLE]
  if (named !== undefined && named !== '' && probe.exists(named)) return named
  const carried = carriedChrome(platform, arch, probe)
  if (carried !== undefined) return carried
  const known = (WELL_KNOWN[platform] ?? []).find(candidate => probe.exists(candidate))
  if (known !== undefined) return known
  return playwrightChrome(env, probe)
}

/**
 * The browser this install carries, if the platform package is present.
 *
 * Ranked ABOVE the machine's own Chrome and below `RABI_CHROME`. That ordering
 * is the point of carrying one: the carried build is pinned, so every install
 * that has it renders the same page the same way and a bug report names a
 * version everyone can reproduce. Someone who wants their own browser still
 * has the environment variable, which is unconditional.
 *
 * Absent is ordinary, not an error: the platform packages are
 * `optionalDependencies` gated by `os`/`cpu`, so an unlisted platform installs
 * none of them and falls through to the search below.
 * @param platform - `process.platform`.
 * @param arch - `process.arch`.
 * @param probe - filesystem probe.
 * @returns the carried executable's path, or undefined.
 */
function carriedChrome(platform: string, arch: string, probe: ChromeProbe): string | undefined {
  // The manifest, not the browser: a package's own `chromium.json` is the only
  // file whose path is stable across the four payload layouts (a macOS .app
  // bundle and a Linux directory share nothing), and it names the executable
  // inside its own directory.
  const manifestPath = probe.manifest(`@unieai/rabi-chromium-${platform}-${arch}/chromium.json`)
  if (manifestPath === undefined) return undefined
  const manifest = probe.readManifest(manifestPath)
  if (typeof manifest?.executable !== 'string') return undefined
  const executable = join(dirname(manifestPath), 'browser', manifest.executable)
  return probe.exists(executable) ? executable : undefined
}

/**
 * The Chromium a Playwright install left on this machine, if any.
 * @param env - environment carrying an optional `PLAYWRIGHT_BROWSERS_PATH`.
 * @param probe - filesystem probe.
 * @returns the executable path, or undefined.
 */
function playwrightChrome(
  env: Record<string, string | undefined>,
  probe: ChromeProbe,
): string | undefined {
  const base = env['PLAYWRIGHT_BROWSERS_PATH'] ?? join(homedir(), '.cache', 'ms-playwright')
  // Newest first: the directory names carry Playwright's own build number, so
  // a numeric-aware sort picks the most recent install rather than the one
  // whose name happens to sort last as text.
  const dirs = probe.list(base)
    .filter(name => name.startsWith('chromium-'))
    .sort((left, right) => Number.parseInt(right.slice(9), 10) - Number.parseInt(left.slice(9), 10))
  for (const dir of dirs) {
    for (const relative of PLAYWRIGHT_EXECUTABLES) {
      const candidate = join(base, dir, relative)
      if (probe.exists(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * The flags this package launches a browser with.
 *
 * A SEPARATE PROFILE, ALWAYS. `--user-data-dir` points at a directory this
 * package owns. Chrome refuses `--remote-debugging-port` on a profile that is
 * already open, so reusing the person's would either fail or — worse — require
 * them to close their own browser first. It also means their cookies, history
 * and extensions are not reachable from this panel, which is the right default
 * for a surface that renders whatever a page sends it.
 *
 * @param profileDir - directory this browser's profile lives in.
 * @param width - initial viewport width.
 * @param height - initial viewport height.
 * @returns the argument list, without the executable.
 */
export function chromeArgs(profileDir: string, width: number, height: number): string[] {
  return [
    // Port 0 asks the OS for a free one; the chosen port is read back from the
    // browser's own stderr, so two panels never collide on a fixed number.
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${String(width)},${String(height)}`,
    // The first-run flows are for a person opening their own browser; this one
    // is opened for them and would show a tour over the page they asked for.
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    // Headless: the page is rendered INTO the panel, so a second window on the
    // host's desktop would be a duplicate the person did not ask for — and on
    // a machine with no display there is nowhere to put it.
    '--headless=new',
    '--hide-scrollbars',
  ]
}
