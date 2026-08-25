/**
 * Fill one platform package with the pinned Chrome for Testing build.
 *
 * Chrome for Testing ships as a plain zip per platform, so every package can be
 * assembled from ANY machine — unlike the Landlock launcher next door, which is
 * compiled and therefore needs a runner per target. That is why this is one
 * script over a list rather than a build matrix.
 *
 * Usage: node scripts/fetch-chromium.mjs [platform ...]   (default: all)
 */
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pinned = JSON.parse(await readFile(join(root, 'chromium-version.json'), 'utf8'))

/**
 * The BSD-3-Clause text Chromium is published under.
 *
 * Written beside the payload because the snapshot archives carry no licence
 * file of their own, and a package that redistributes a binary without stating
 * its terms is one nobody can safely depend on.
 */
const CHROMIUM_LICENSE = `Copyright 2015 The Chromium Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google LLC nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`

/**
 * Run one command to completion.
 * @param command - program to run.
 * @param args - its arguments.
 * @returns settles when it exits 0.
 */
function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(new Error(`${command} exited ${String(code)}`)))
  })
}

/**
 * Build artefacts the snapshot archive carries that a browser does not need.
 *
 * The snapshot zips are a build OUTPUT directory, not a curated browser
 * distribution — that is the one thing Chrome for Testing's archives did
 * better. `interactive_ui_tests.exe` alone is 342MB, larger than the browser
 * beside it. Matched as a name pattern rather than an exact list so the next
 * test binary Chromium adds is dropped too, and denied rather than allowed so
 * a file the browser turns out to need is never silently removed.
 */
const TEST_ARTEFACT = /(?:_tests?|_unittests|_browsertests|_perftests)(?:\.exe)?$/u

/**
 * Build metadata the archive carries that the browser never reads.
 *
 * `.pak.info` is the resource-id map GRIT writes beside each `.pak` for
 * debugging a build; Chromium does not open it at runtime and Chrome for
 * Testing's archives do not ship it. On Linux it is 68MB across 228 files —
 * more than a third of what the registry was being asked to accept.
 */
const BUILD_METADATA = /\.pak\.info$/u

/**
 * Whether one locale pack is in the keep list.
 *
 * The names are `<locale>.pak` plus grammatical-gender siblings
 * (`de_FEMININE.pak` and friends, 18 bytes each), so the locale is the part
 * before the first underscore.
 * @param name - the file name.
 * @returns true when the payload should keep it.
 */
function keepsLocale(name) {
  if (!name.endsWith('.pak')) return true
  const locale = name.slice(0, -4).split('_')[0]
  return pinned.locales.keep.includes(locale)
}

/**
 * Drop the build artefacts that are not part of the browser, and the locale
 * packs outside the keep list ({@link chromium-version.json}'s `locales.why`).
 * @param dir - the unpacked payload root.
 * @returns bytes reclaimed.
 */
async function prune(dir) {
  let reclaimed = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      reclaimed += await prune(path)
      continue
    }
    const unwanted = TEST_ARTEFACT.test(entry.name)
      || BUILD_METADATA.test(entry.name)
      || (dir.endsWith('locales') && !keepsLocale(entry.name))
    if (!unwanted) continue
    reclaimed += (await stat(path)).size
    await rm(path, { force: true })
  }
  return reclaimed
}

/**
 * Download and unpack one platform's browser into its package.
 * @param platform - the `<os>-<arch>` key.
 */
async function fetchOne(platform) {
  const entry = pinned.platforms[platform]
  if (entry === undefined) throw new Error(`fetch-chromium: no download pinned for ${platform}`)
  const packageDir = join(root, 'packages', platform)
  await stat(packageDir).catch(() => { throw new Error(`fetch-chromium: no package directory for ${platform}`) })

  const browserDir = join(packageDir, 'browser')
  await rm(browserDir, { recursive: true, force: true })
  await mkdir(browserDir, { recursive: true })

  const staging = await mkdtemp(join(tmpdir(), 'rabi-chromium-'))
  const archive = join(staging, 'chrome.zip')
  process.stdout.write(`fetch-chromium: ${platform} r${entry.revision} downloading\n`)
  const response = await fetch(entry.url)
  if (!response.ok) throw new Error(`fetch-chromium: ${entry.url} answered ${String(response.status)}`)
  await pipeline(response.body, createWriteStream(archive))

  // The snapshots carry no Widevine and no Google branding, which is the whole
  // reason they are the source: a check here would be theatre, but the absence
  // is asserted by native/chromium/scripts/verify-payload.mjs before a release.
  // `unzip` rather than a JS unzipper: the macOS payload is an .app bundle
  // whose SYMLINKS and executable bits are what make it launchable, and the
  // zip readers on npm drop both. A build that silently produces an unusable
  // .app would only be found by someone installing it.
  process.stdout.write(`fetch-chromium: ${platform} unpacking\n`)
  await run('unzip', ['-q', archive, '-d', browserDir])
  await rm(staging, { recursive: true, force: true })

  const reclaimed = await prune(browserDir)
  if (reclaimed > 0) {
    process.stdout.write(`fetch-chromium: ${platform} dropped ${String(Math.round(reclaimed / 1048576))}MB of build artefacts\n`)
  }

  const executable = join(browserDir, entry.executable)
  await stat(executable).catch(() => {
    throw new Error(`fetch-chromium: ${platform} unpacked without ${entry.executable}`)
  })
  // The zip carries the bit, but only on filesystems that keep it; setting it
  // is cheap and a browser that cannot be executed is the whole package wasted.
  await chmod(executable, 0o755)

  await writeFile(join(packageDir, 'LICENSE'), CHROMIUM_LICENSE)
  await writeFile(join(packageDir, 'chromium.json'), `${JSON.stringify({
    revision: entry.revision,
    channel: entry.channel,
    platform,
    executable: entry.executable,
  }, null, 2)}\n`)
  process.stdout.write(`fetch-chromium: ${platform} ready\n`)
}

const wanted = process.argv.slice(2)
const platforms = wanted.length > 0 ? wanted : Object.keys(pinned.platforms)
for (const platform of platforms) await fetchOne(platform)
