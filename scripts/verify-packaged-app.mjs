/**
 * Boot the PACKAGED desktop tree and prove it serves a page its plugins loaded
 * into.
 *
 * Three releases in a row shipped broken and each was found by a person
 * installing it. The failures were not alike, and that is the point of this
 * check:
 *
 *   0.1.9  — the harness died at boot importing `@unieai/uad-browser-operator/
 *            lib/chromium.js`, a subpath the package promised and the build
 *            never emitted.
 *   0.1.10 — the same, unreleased fix still pending.
 *   0.1.11 — the harness booted and the page died: every plugin package
 *            resolved to nothing through the profile's module fallback, so the
 *            served HTML carried `entries: []` and the browser threw
 *            "client-modules: HTML did not preload …/client.js".
 *
 * What they have in common is that `GET /` answered 200 with the right
 * <title> in all three. Fetching the page proves nothing; the boot graph does.
 *
 * WHY ELECTRON'S NODE, not this machine's: the packaged tree is resolved by
 * the Electron runtime, whose module resolution is not plain Node's — it reads
 * through the asar archive, and it preserves symlinks. Running the harness
 * with the system `node` answers a question nobody asked.
 *
 * Usage: `node scripts/verify-packaged-app.mjs` after
 * `pnpm --filter @unieai/uad-desktop run package:dir`.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const unpacked = join(root, 'apps/desktop/release/linux-unpacked')
const electron = join(unpacked, 'rabi')
const harness = join(unpacked, 'resources/app.asar/node_modules/@unieai/rabi/lib/bin.js')
const port = 31_711

/** How long the packaged harness gets to print its URL line. */
const BOOT_TIMEOUT_MS = 120_000

/**
 * Fail with a message that names the artifact, not just the symptom.
 * @param message - what went wrong.
 * @returns never; exits with status 1.
 */
function fail(message) {
  console.error(`verify-packaged-app: ${message}`)
  process.exit(1)
}

if (!existsSync(electron)) {
  fail(`no packaged tree at ${unpacked}; run \`pnpm --filter @unieai/uad-desktop run package:dir\` first`)
}

// A fresh home: the profile's module fallback is BUILT at first launch, and
// reusing a home built by a working install would hide the failure this check
// exists for.
const home = mkdtempSync(join(tmpdir(), 'rabi-packaged-'))
let child
let output = ''

/**
 * Stop the packaged harness and remove the temporary home.
 * @returns nothing.
 */
function cleanup() {
  child?.kill('SIGTERM')
  rmSync(home, { recursive: true, force: true })
}

/**
 * Wait for the harness to print its URL line, or fail with what it printed.
 * @returns the served origin.
 */
async function boot() {
  child = spawn(electron, [harness, 'web', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const collect = (chunk) => { output += String(chunk) }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const deadline = Date.now() + BOOT_TIMEOUT_MS
  for (;;) {
    const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output)
    if (match) return match[0]
    if (child.exitCode !== null) fail(`the packaged harness exited before serving:\n${output.slice(-4000)}`)
    if (Date.now() > deadline) fail(`no URL line within ${String(BOOT_TIMEOUT_MS / 1000)}s:\n${output.slice(-4000)}`)
    await new Promise(resolve_ => { setTimeout(resolve_, 500) })
  }
}

/**
 * Read the boot graph the page is handed, which is what decides whether any
 * plugin can run in the browser.
 * @param html - the served document.
 * @returns the parsed graph.
 */
function bootGraph(html) {
  const match = /__DSH_BOOT__"\] = (\{.*?\})<\/script>/s.exec(html)
  if (!match) fail('the served page carries no __DSH_BOOT__ graph at all')
  try {
    return JSON.parse(match[1])
  } catch (error) {
    fail(`the boot graph is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

try {
  const origin = await boot()
  const response = await fetch(`${origin}/`)
  if (!response.ok) fail(`GET / answered ${String(response.status)}`)
  const html = await response.text()

  const graph = bootGraph(html)
  const entries = Array.isArray(graph.entries) ? graph.entries : []
  if (entries.length === 0) {
    fail('the boot graph is EMPTY: the page would die on "HTML did not preload'
      + ' @unieai/uad-client-modules/client.js". Every client package resolved to nothing.')
  }

  // The two bundles the parser must execute before anything else. Their
  // absence is the exact failure 0.1.11 shipped.
  for (const id of ['@unieai/uad-client-modules', '@unieai/uad-client-runtime']) {
    if (!entries.some(entry => entry.id === id)) fail(`the boot graph does not carry ${id}`)
    if (!html.includes(`/plugins/${id}/client.js`)) fail(`the page does not preload ${id}/client.js`)
  }

  // Preloading a URL that 404s fails the same way as not preloading it.
  for (const id of ['@unieai/uad-client-modules', '@unieai/uad-client-runtime']) {
    const entry = entries.find(candidate => candidate.id === id)
    const bundle = await fetch(`${origin}${entry.url}`)
    if (!bundle.ok) fail(`${id} preload URL answered ${String(bundle.status)}`)
    const text = await bundle.text()
    if (!text.includes('__ModuleLoader__')) fail(`${id} bundle does not register with the module loader`)
  }

  console.log(`verify-packaged-app: packaged tree booted, ${String(entries.length)} plugin bundle(s) in the boot graph.`)
} finally {
  cleanup()
}
