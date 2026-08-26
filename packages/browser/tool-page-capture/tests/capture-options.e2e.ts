/**
 * The capture options that decide whether a screenshot is of the PAGE or of a
 * page that had not finished arriving — against a real browser and a real
 * page served over loopback.
 *
 * In the e2e lane because it needs Chromium. It self-skips where none is
 * resolvable, the way the model-backed suites skip without a key: a machine
 * with no browser should report "not run", not "failed".
 */
import { afterAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { resolveChrome } from '@unieai/uad-browser-operator/chromium'
import { FILESYSTEM_CHROME_PROBE } from '@unieai/uad-browser-operator/chromium'
import { capturePage, CaptureError } from '../src/capture.ts'

/** A page whose interesting content arrives AFTER load, like a real app's. */
const PAGE = `<!doctype html><meta charset="utf-8"><title>Late page</title>
<style>
  body { margin: 0; font: 16px system-ui; background: #fff; color: #111 }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #eee } }
  #toast { position: fixed; top: 20px; left: 20px; width: 200px; height: 60px; background: #f33 }
  #card { margin: 120px 40px; width: 300px; height: 150px; background: #0a7 }
</style>
<body>
  <div id="toast">A notification</div>
  <div id="card">Card</div>
  <div id="late"></div>
  <script>setTimeout(() => { document.querySelector('#late').textContent = 'DATA ARRIVED' }, 1500)</script>
</body>`

const chrome = resolveChrome(process.env, process.platform, FILESYSTEM_CHROME_PROBE)
let site: Server | undefined
let origin = ''

afterAll(() => {
  site?.close()
})

/**
 * Serve the page once for the whole file.
 * @returns the origin it is served from.
 */
async function served(): Promise<string> {
  if (origin !== '') return origin
  site = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(PAGE)
  })
  await new Promise<void>((resolve) => { site?.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${String((site.address() as { port: number }).port)}/`
  return origin
}

/**
 * A capture request over the served page.
 * @param extra - the option under test.
 * @returns the full request.
 */
async function request(extra: Record<string, unknown>) {
  return {
    url: await served(),
    width: 800,
    height: 600,
    fullPage: false,
    settleMs: 200,
    startupTimeoutSeconds: 20,
    ...extra,
  }
}

describe.skipIf(chrome === undefined)('capture options, in a real browser', () => {
  it('waits for content that arrives after the page has loaded', async () => {
    // The settle timer alone would have photographed the page before this
    // text existed, which is the failure the option exists for.
    const shot = await capturePage(await request({ waitForText: 'DATA ARRIVED' }), FILESYSTEM_CHROME_PROBE, process.env)
    expect(shot.png.byteLength).toBeGreaterThan(0)
  }, 60_000)

  it('fails rather than returning a picture of a page that never arrived', async () => {
    // A skeleton that answers the question wrongly is worse than no answer.
    await expect(capturePage(
      await request({ waitForText: 'NEVER APPEARS', startupTimeoutSeconds: 3 }),
      FILESYSTEM_CHROME_PROBE,
      process.env,
    )).rejects.toMatchObject({ code: 'CONTENT_NOT_FOUND' })
  }, 60_000)

  it('photographs one element at its own size', async () => {
    const shot = await capturePage(await request({ clipSelector: '#card' }), FILESYSTEM_CHROME_PROBE, process.env)
    expect([shot.width, shot.height]).toEqual([300, 150])
  }, 60_000)

  it('treats a selector that matches nothing as an error, not a whole-page shot', async () => {
    // Silently widening the shot would answer a different question than asked.
    await expect(capturePage(
      await request({ clipSelector: '#nope' }),
      FILESYSTEM_CHROME_PROBE,
      process.env,
    )).rejects.toBeInstanceOf(CaptureError)
  }, 60_000)

  it('renders the asked-for colour scheme, and hides what it was told to hide', async () => {
    const light = await capturePage(await request({ theme: 'light' }), FILESYSTEM_CHROME_PROBE, process.env)
    const dark = await capturePage(await request({ theme: 'dark' }), FILESYSTEM_CHROME_PROBE, process.env)
    const hidden = await capturePage(
      await request({ theme: 'light', hideSelectors: ['#toast'] }),
      FILESYSTEM_CHROME_PROBE,
      process.env,
    )
    // Pixels, not options echoed back: the only proof that the emulation and
    // the injected rule reached the page.
    const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b))
    expect(same(light.png, dark.png)).toBe(false)
    expect(same(light.png, hidden.png)).toBe(false)
  }, 120_000)
})
