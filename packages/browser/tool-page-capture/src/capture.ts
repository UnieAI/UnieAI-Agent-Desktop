/**
 * Taking one picture of one web page.
 *
 * Separate from the tool that offers it so the browser work can be tested
 * without a tool registry, and so the tool file stays about what the MODEL
 * sees.
 * @module @unieai/uad-tool-page-capture/capture
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CdpConnection, chromeArgs, endpointFrom, resolveChrome, type ChromeProbe,
} from '@unieai/uad-browser-operator/chromium'

/** What one capture needs. */
export interface CaptureRequest {
  /** Absolute `http` or `https` address. */
  url: string
  /** Viewport width in CSS pixels. */
  width: number
  /** Viewport height in CSS pixels. */
  height: number
  /**
   * Whether to capture past the viewport to the document's full height.
   *
   * A manual usually wants the whole page; a "what does this look like"
   * question usually wants the fold. Neither is a safe default for the other,
   * so the caller says.
   */
  fullPage: boolean
  /** How long to wait for the page to settle before shooting. */
  settleMs: number
  /** How long to wait for the browser to report its debugging endpoint. */
  startupTimeoutSeconds: number
}

/** What one capture produced. */
export interface CaptureResult {
  /** PNG bytes. */
  png: Uint8Array
  /** The page's own title, empty when it declared none. */
  title: string
  /** The address after any redirect. */
  url: string
  /** Captured pixel dimensions. */
  width: number
  height: number
}

/** A capture failure a caller can branch on without parsing prose. */
export class CaptureError extends Error {
  constructor(readonly code: 'NO_CHROME' | 'BLOCKED_URL' | 'NAVIGATION_FAILED' | 'TIMEOUT', message: string) {
    super(message)
    this.name = 'CaptureError'
  }
}

/**
 * Refuse anything but `http` and `https`.
 *
 * The same fence the operator browser draws, and for the same reason: `file:`
 * would turn a URL parameter into a reader for the host filesystem, and the
 * schemes a browser treats specially reach the browser rather than a page.
 * Here it also stands between a MODEL and the machine, which is the stronger
 * case of the two.
 * @param url - the address to check.
 * @throws {CaptureError} code `BLOCKED_URL` for any other scheme.
 */
export function assertCapturable(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new CaptureError('BLOCKED_URL', `not an absolute address: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CaptureError('BLOCKED_URL', `${parsed.protocol} is not an address this tool opens`)
  }
}

/**
 * Photograph one page in a browser that exists only for this call.
 *
 * A fresh profile and a fresh process every time, thrown away after. A
 * long-lived browser would be faster and would also carry one call's cookies
 * into the next one's screenshot, which for a tool a model drives is a way to
 * leak one site's session into another site's picture.
 * @param request - the page, the viewport, and the waits.
 * @param probe - filesystem probe used to find a browser; injectable for tests.
 * @param env - environment the browser search reads.
 * @returns the picture and what was on screen.
 */
export async function capturePage(
  request: CaptureRequest,
  probe: ChromeProbe,
  env: Record<string, string | undefined> = process.env,
): Promise<CaptureResult> {
  assertCapturable(request.url)
  const chrome = resolveChrome(env, process.platform, probe)
  if (chrome === undefined) {
    throw new CaptureError('NO_CHROME', 'no Chromium found; the carried browser package is absent and this machine has none')
  }
  const profileDir = mkdtempSync(join(tmpdir(), 'rabi-capture-'))
  const child = spawn(chrome, chromeArgs(profileDir, request.width, request.height), {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const discard = (): void => {
    child.kill('SIGKILL')
    // Chrome's helpers are still writing as the parent goes; a first removal
    // loses that race with ENOTEMPTY.
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }

  let cdp: CdpConnection | undefined
  try {
    const endpoint = await awaitEndpoint(child, request.startupTimeoutSeconds)
    cdp = new CdpConnection(endpoint)
    await cdp.ready()

    const targets = await cdp.send('Target.getTargets')
    const infos = (targets['targetInfos'] ?? []) as { targetId: string; type: string }[]
    const page = infos.find(info => info.type === 'page')
    const targetId = page === undefined
      ? String((await cdp.send('Target.createTarget', { url: 'about:blank' }))['targetId'])
      : page.targetId
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const sessionId = String(attached['sessionId'])

    await cdp.sendTo(sessionId, 'Page.enable')
    await cdp.sendTo(sessionId, 'Emulation.setDeviceMetricsOverride', {
      width: request.width, height: request.height, deviceScaleFactor: 1, mobile: false,
    })
    const navigated = await cdp.sendTo(sessionId, 'Page.navigate', { url: request.url })
    const failure = navigated['errorText']
    if (typeof failure === 'string' && failure !== '') {
      throw new CaptureError('NAVIGATION_FAILED', `${request.url}: ${failure}`)
    }
    // A fixed settle rather than a load event: a page that finishes loading is
    // not the same as a page that has finished PAINTING, and the tool's job is
    // what a person would see.
    await new Promise<void>((resolve) => { setTimeout(resolve, request.settleMs) })

    const shot = await cdp.sendTo(sessionId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: request.fullPage,
    })
    const encoded = shot['data']
    if (typeof encoded !== 'string') throw new CaptureError('NAVIGATION_FAILED', 'the browser returned no image')

    const metrics = await cdp.sendTo(sessionId, 'Page.getLayoutMetrics')
    const css = (metrics['cssContentSize'] ?? {}) as { width?: number; height?: number }
    const title = await evaluateString(cdp, sessionId, 'document.title', '')
    const href = await evaluateString(cdp, sessionId, 'location.href', request.url)

    return {
      png: Buffer.from(encoded, 'base64'),
      title,
      url: href,
      width: request.width,
      height: request.fullPage ? Math.max(request.height, Math.trunc(css.height ?? request.height)) : request.height,
    }
  } finally {
    cdp?.close()
    discard()
  }
}

/**
 * Evaluate one expression and take its value only when it is a string.
 *
 * `Runtime.evaluate` answers with whatever the page produced, and a page can
 * shadow `document.title` with an object; stringifying that would put
 * `[object Object]` into a screenshot's caption. A non-string is treated as
 * absent instead.
 * @param cdp - the attached connection.
 * @param sessionId - the page's session.
 * @param expression - the expression to run.
 * @param fallback - what to return when the page answers with anything else.
 * @returns the string value, or the fallback.
 */
async function evaluateString(
  cdp: CdpConnection, sessionId: string, expression: string, fallback: string,
): Promise<string> {
  try {
    const reply = await cdp.sendTo(sessionId, 'Runtime.evaluate', { expression, returnByValue: true })
    const value = ((reply['result'] ?? {}) as { value?: unknown }).value
    return typeof value === 'string' ? value : fallback
  } catch {
    // A page that refuses evaluation still deserves its picture; the caption
    // is the only thing that loses.
    return fallback
  }
}

/**
 * Read the DevTools endpoint out of the browser's own stderr.
 * @param child - the spawned browser.
 * @param timeoutSeconds - how long to wait for the line.
 * @returns the websocket endpoint.
 */
function awaitEndpoint(child: ReturnType<typeof spawn>, timeoutSeconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = ''
    const timer = setTimeout(() => {
      // The browser's own stderr is the only thing that can say why it never
      // started, so it travels with the failure instead of being replaced by a
      // bare timeout.
      reject(new CaptureError('TIMEOUT', `the browser reported no debugging endpoint within ${String(timeoutSeconds)}s: ${buffered.slice(-400)}`))
    }, timeoutSeconds * 1000)
    child.stderr?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8')
      const endpoint = endpointFrom(buffered)
      if (endpoint === undefined) return
      clearTimeout(timer)
      resolve(endpoint)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new CaptureError('NO_CHROME', `the browser exited with code ${String(code)}: ${buffered.slice(-400)}`))
    })
  })
}
