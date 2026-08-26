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
  /**
   * Text that must be on the page before the shot is taken.
   *
   * The difference between a picture and a picture of a loading skeleton. A
   * settle timer answers "has it had time?", never "is it there?", and an app
   * holding a stream or a poll open never goes network-idle at all, so a
   * timer is all a caller would otherwise have. When the text never arrives
   * the capture FAILS rather than returning the skeleton, because a skeleton
   * that answers the question wrongly is worse than no answer.
   */
  waitForText?: string
  /** CSS selector whose box is the picture; omitted captures the page. */
  clipSelector?: string
  /**
   * Selectors hidden before the shot.
   *
   * For the notification that happened to be on screen. Hidden with
   * `visibility`, not `display`, so removing a toast does not reflow the page
   * being photographed.
   */
  hideSelectors?: readonly string[]
  /** Colour scheme to emulate; omitted follows the browser's own default. */
  theme?: 'light' | 'dark'
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
  constructor(
    readonly code: 'NO_CHROME' | 'BLOCKED_URL' | 'NAVIGATION_FAILED' | 'TIMEOUT'
      | 'CONTENT_NOT_FOUND' | 'ELEMENT_NOT_FOUND',
    message: string,
  ) {
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
    // Before navigating: a scheme applied after first paint photographs a page
    // mid-repaint, and some pages read the preference once at startup.
    if (request.theme !== undefined) {
      await cdp.sendTo(sessionId, 'Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: request.theme }],
      })
    }
    const navigated = await cdp.sendTo(sessionId, 'Page.navigate', { url: request.url })
    const failure = navigated['errorText']
    if (typeof failure === 'string' && failure !== '') {
      throw new CaptureError('NAVIGATION_FAILED', `${request.url}: ${failure}`)
    }
    // A fixed settle rather than a load event: a page that finishes loading is
    // not the same as a page that has finished PAINTING, and the tool's job is
    // what a person would see.
    await new Promise<void>((resolve) => { setTimeout(resolve, request.settleMs) })

    if (request.waitForText !== undefined && request.waitForText !== '') {
      await waitForText(cdp, sessionId, request.waitForText, request.startupTimeoutSeconds * 1000)
    }
    if (request.hideSelectors !== undefined && request.hideSelectors.length > 0) {
      await hideElements(cdp, sessionId, request.hideSelectors)
    }
    const clip = request.clipSelector === undefined
      ? undefined
      : await clipOf(cdp, sessionId, request.clipSelector)

    const shot = await cdp.sendTo(sessionId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: request.fullPage,
      ...clip === undefined ? {} : { clip: { ...clip, scale: 1 } },
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
      width: clip === undefined ? request.width : Math.max(1, Math.round(clip.width)),
      height: clip !== undefined
        ? Math.max(1, Math.round(clip.height))
        : request.fullPage
          ? Math.max(request.height, Math.trunc(css.height ?? request.height))
          : request.height,
    }
  } finally {
    cdp?.close()
    discard()
  }
}

/** How often the page is asked whether the awaited text has arrived. */
const WAIT_POLL_MS = 250

/**
 * Block until the page contains `text`, or fail.
 *
 * Polling `innerText` rather than waiting on a load or network event: the
 * question is whether the CONTENT is there, and a single-page app answers a
 * navigation long before its data arrives — while an app holding a stream open
 * never reports idle at all.
 * @param cdp - the attached connection.
 * @param sessionId - the page session.
 * @param text - the substring that must appear.
 * @param timeoutMs - how long to keep asking.
 * @returns nothing; throws `CONTENT_NOT_FOUND` when it never arrives.
 */
async function waitForText(
  cdp: CdpConnection,
  sessionId: string,
  text: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const expression = `String(document.body?.innerText ?? '').includes(${JSON.stringify(text)})`
  for (;;) {
    const answer = await cdp.sendTo(sessionId, 'Runtime.evaluate', { expression, returnByValue: true })
    const result = (answer['result'] ?? {}) as { value?: unknown }
    if (result.value === true) return
    if (Date.now() >= deadline) {
      throw new CaptureError(
        'CONTENT_NOT_FOUND',
        `the page never showed ${JSON.stringify(text)} within ${String(Math.round(timeoutMs / 1000))}s;`
        + ' the capture would have been of a page that had not finished arriving',
      )
    }
    await new Promise<void>((resolve) => { setTimeout(resolve, WAIT_POLL_MS) })
  }
}

/**
 * Hide every matching element before the shot.
 *
 * `visibility`, not `display`: a toast removed from layout reflows everything
 * under it, so the picture would no longer be of the page as it stood.
 * @param cdp - the attached connection.
 * @param sessionId - the page session.
 * @param selectors - CSS selectors to hide.
 * @returns nothing.
 */
async function hideElements(
  cdp: CdpConnection,
  sessionId: string,
  selectors: readonly string[],
): Promise<void> {
  const rule = `${selectors.join(', ')} { visibility: hidden !important; }`
  const expression = `(() => {
    const style = document.createElement('style')
    style.textContent = ${JSON.stringify(rule)}
    document.head.appendChild(style)
  })()`
  await cdp.sendTo(sessionId, 'Runtime.evaluate', { expression })
}

/**
 * The page-space box of one element.
 *
 * Page space, not viewport space: `captureScreenshot`'s clip is measured from
 * the document origin, so an element scrolled out of view still photographs
 * correctly.
 * @param cdp - the attached connection.
 * @param sessionId - the page session.
 * @param selector - CSS selector for the element.
 * @returns the clip rectangle.
 */
async function clipOf(
  cdp: CdpConnection,
  sessionId: string,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const expression = `(() => {
    const node = document.querySelector(${JSON.stringify(selector)})
    if (node === null) return null
    const box = node.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    return { x: box.x + window.scrollX, y: box.y + window.scrollY, width: box.width, height: box.height }
  })()`
  const answer = await cdp.sendTo(sessionId, 'Runtime.evaluate', { expression, returnByValue: true })
  const result = (answer['result'] ?? {}) as { value?: unknown }
  const box = result.value as { x?: number; y?: number; width?: number; height?: number } | null | undefined
  if (box === null || box === undefined || typeof box.width !== 'number') {
    throw new CaptureError(
      'ELEMENT_NOT_FOUND',
      `no visible element matches ${JSON.stringify(selector)}; a zero-sized match counts as absent`,
    )
  }
  return { x: box.x ?? 0, y: box.y ?? 0, width: box.width, height: box.height ?? 0 }
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
