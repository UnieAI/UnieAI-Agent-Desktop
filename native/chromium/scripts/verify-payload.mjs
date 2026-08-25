/**
 * Refuse to publish a payload that is not the open-source browser.
 *
 * The distinction this checks is the reason these packages exist in this shape
 * at all. Chrome for Testing — the obvious thing to download, and what an
 * earlier draft did — is a GOOGLE-BRANDED build: it ships the proprietary
 * Widevine CDM and an ABOUT file reading "Google Chrome … All rights
 * reserved", under Chrome's Terms of Service rather than an open licence.
 * Redistributing that under our own scope is not ours to do. Chromium's own
 * snapshot builds carry neither, and this asserts that per platform rather
 * than trusting the URL in the pin to still point where it did.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pinned = JSON.parse(await readFile(join(root, 'chromium-version.json'), 'utf8'))

/** Path fragments that mean a proprietary component came along. */
const FORBIDDEN = ['widevine', 'WidevineCdm']

/**
 * Every file under one directory, as repository-relative paths.
 * @param dir - directory to walk.
 * @returns the paths beneath it.
 */
async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await walk(path))
    else found.push(path)
  }
  return found
}

const problems = []
for (const [platform, entry] of Object.entries(pinned.platforms)) {
  const packageDir = join(root, 'packages', platform)
  const browserDir = join(packageDir, 'browser')
  const files = await walk(browserDir).catch(() => [])
  if (files.length === 0) {
    problems.push(`${platform}: no payload — run scripts/fetch-chromium.mjs ${platform}`)
    continue
  }
  const proprietary = files.filter(path => FORBIDDEN.some(bad => path.includes(bad)))
  if (proprietary.length > 0) {
    problems.push(`${platform}: ${String(proprietary.length)} proprietary file(s), first ${proprietary[0]}`)
  }
  // The branded build ships this file; the open one does not.
  const about = files.find(path => path.endsWith(`${platform.startsWith('win') ? '\\' : '/'}ABOUT`))
  if (about !== undefined) {
    const text = await readFile(about, 'utf8')
    if (text.includes('Google Chrome')) problems.push(`${platform}: ABOUT names Google Chrome — this is the branded build`)
  }
  await stat(join(browserDir, entry.executable))
    .catch(() => { problems.push(`${platform}: pinned executable ${entry.executable} is not in the payload`) })
  await stat(join(packageDir, 'LICENSE'))
    .catch(() => { problems.push(`${platform}: no LICENSE beside the payload`) })
  process.stdout.write(`verify-payload: ${platform} r${entry.revision} ${String(files.length)} file(s), clean\n`)
}

if (problems.length > 0) {
  process.stderr.write(`verify-payload: ${String(problems.length)} problem(s):\n${problems.map(one => `  ${one}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('verify-payload: every payload is the open-source build\n')
