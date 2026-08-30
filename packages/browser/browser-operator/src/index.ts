/**
 * The browser a person drives, as a Host service.
 *
 * The page is rendered by a real Chromium on the host machine and streamed
 * into the panel as frames; clicks and keystrokes go back the other way. It is
 * a real browser because the alternatives are not: an `<iframe>` is refused by
 * every site that sets `X-Frame-Options`, and a page it did load is
 * cross-origin, so the panel could neither read it nor drive it. A window
 * opened with `window.open` is a page the application cannot see at all.
 *
 * WHY THE MACHINE'S OWN BROWSER. Rabi is installed on the machine the person
 * is sitting at, which already has Chrome; downloading a second Chromium to
 * look at a web page would cost 150MB to duplicate something already present.
 * A separate profile is used regardless — Chrome refuses a debugging port on a
 * profile that is already open, and a panel that could read someone's cookies
 * and history is not a trade worth making for convenience.
 *
 * FRAMES ARE PUSHED, INPUT IS CALLED. A page repaints whenever it likes,
 * including long after the call that navigated it returned, so frames ride the
 * host event stream. A click has an answer — it either reached the page or the
 * browser is gone — so it is a call.
 * @module @unieai/uad-browser-operator
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, chmodSync, constants, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { Context, Service } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { CdpConnection, endpointFrom } from './cdp.ts'
import { chromeArgs, resolveChrome, type ChromeProbe } from './chrome.ts'
import { FILESYSTEM_CHROME_PROBE } from './probe.ts'
import { validateConfig, type Config, type ResolvedConfig } from './config.ts'
import {
  OperatorBrowserError,
  type OperatorBrowserId,
  type OperatorBrowserKey,
  type OperatorBrowserOpenSpec,
  type OperatorBrowserPointer,
  type OperatorBrowserView,
} from './types.ts'

export { validateConfig } from './config.ts'
export { FILESYSTEM_CHROME_PROBE } from './probe.ts'
export type { Config, ResolvedConfig } from './config.ts'
export { CHROME_PATH_VARIABLE, chromeArgs, resolveChrome } from './chrome.ts'
export type { ChromeProbe } from './chrome.ts'
export { CdpConnection, endpointFrom } from './cdp.ts'
export type { CdpEvent } from './cdp.ts'
export {
  OperatorBrowserError,
  type OperatorBrowserErrorCode,
  type OperatorBrowserId,
  type OperatorBrowserKey,
  type OperatorBrowserOpenSpec,
  type OperatorBrowserPointer,
  type OperatorBrowserView,
} from './types.ts'

declare module '@unieai/cordis' {
  interface Context {
    operatorBrowsers: OperatorBrowserService
  }
  interface Events {
    /**
     * One repaint of a browser's page, as a base64 JPEG.
     * @param browserId - the browser that painted it.
     * @param data - the frame, base64-encoded.
     * @mode emit
     */
    'operator-browser/frame': (browserId: OperatorBrowserId, data: string) => void
    /**
     * The set of operator browsers changed, or one of them navigated. Sent
     * whole for the same reason the terminal list is: a second tab and a
     * reconnecting browser have to converge on one authoritative value.
     * @param browsers - every browser the service still holds.
     * @mode emit
     */
    'operator-browser/changed': (browsers: OperatorBrowserView[]) => void
  }
}

/**
 * How many times to ask for the screencast before giving up.
 *
 * Two is what the observed behaviour needs; ten is what a slower machine or a
 * heavier first page might. The cost of the extra headroom is bounded by the
 * fact that only the inactive-page error is retried at all.
 */
const SCREENCAST_ATTEMPTS = 10

/** Pause between screencast attempts, long enough for the activation to land. */
const SCREENCAST_RETRY_MS = 120

/** One live browser and everything the service holds for it. */
interface BrowserRecord {
  view: OperatorBrowserView
  process: ChildProcess
  cdp: CdpConnection
  /** The attached page's session; every page command is addressed to it. */
  sessionId: string
  /** The page target, for the browser-level commands that name one. */
  targetId: string
  profileDir: string
  /** The most recent frame, so a reopened panel paints instead of waiting. */
  lastFrame: string | undefined
}

/**
 * Registry of the browsers a person opened in the GUI.
 *
 * Browsers are scoped to a workspace, like terminals: a page left open on a
 * dashboard must not close because the user started a new conversation.
 */
export class OperatorBrowserService extends Service {
  static inject = []
  // The schema is written HERE rather than imported from config.ts: the config
  // catalog gate walks this expression statically, and an imported identifier
  // is a name it cannot follow. The `Config` interface and its range checks
  // stay next door.
  static Config: z<Config> = z.object({
    enabled: z.boolean().default(true),
    chromePath: z.string().required(false),
    maxBrowsersPerWorkspace: z.number().default(2),
    // Below about 50 the text in a screenshot stops being readable, which is
    // most of what a person looks at; above about 80 the frames get large
    // enough to pace the stream rather than the page.
    frameQuality: z.number().default(70),
    startupTimeoutSeconds: z.number().default(20),
  })

  private readonly browsers = new Map<OperatorBrowserId, BrowserRecord>()
  private readonly config: ResolvedConfig
  private nextId = 0
  private disposing = false

  /**
   * @param ctx - Host plugin context.
   * @param config - plugin config; Schemastery defaults are already applied.
   * @param probe - filesystem probe used to find a browser.
   * @param env - environment the browser search reads.
   */
  constructor(
    ctx: Context,
    config: Config,
    private readonly probe: ChromeProbe = FILESYSTEM_CHROME_PROBE,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    super(ctx, 'operatorBrowsers')
    validateConfig(config)
    this.config = config
    ctx.effect(() => () => this.disposeAll(), 'operator browser teardown')
  }

  /**
   * Open a browser on one address.
   * @param spec - workspace, first address, and the panel's current viewport.
   * @returns the new browser's view.
   */
  async open(spec: OperatorBrowserOpenSpec): Promise<OperatorBrowserView> {
    if (!this.config.enabled) {
      throw new OperatorBrowserError('DISABLED', 'the operator browser is turned off for this deployment')
    }
    assertNavigable(spec.url)
    const live = [...this.browsers.values()]
      .filter(record => record.view.live && record.view.workspaceId === spec.workspaceId)
    if (live.length >= this.config.maxBrowsersPerWorkspace) {
      throw new OperatorBrowserError(
        'TOO_MANY_BROWSERS',
        `this workspace already has ${String(live.length)} open browsers`,
      )
    }
    const chrome = this.config.chromePath !== undefined && this.config.chromePath !== ''
      ? this.config.chromePath
      : resolveChrome(this.env, process.platform, this.probe)
    this.repairCarriedModes()
    if (chrome === undefined) {
      throw new OperatorBrowserError('NO_CHROME', 'no Chrome, Chromium or Edge found; set RABI_CHROME to name one')
    }
    const width = clampSize(spec.width)
    const height = clampSize(spec.height)
    const profileDir = mkdtempSync(join(tmpdir(), 'rabi-browser-'))
    let child = spawn(chrome, chromeArgs(profileDir, width, height), { stdio: ['ignore', 'ignore', 'pipe'] })
    let cdp: CdpConnection
    try {
      let endpoint: string
      try {
        endpoint = await this.awaitEndpoint(child)
      } catch (error: unknown) {
        // `repairCarriedModes` runs before every open, but it finds the payload
        // by RESOLVING the platform package's manifest, and an installer whose
        // layout that resolution cannot see (bunx's temp tree is the one this
        // was reported from) leaves the modes untouched. The path we were about
        // to spawn is known either way, so repair from there and try once more.
        if (!isNotExecutable(error)) throw error
        child.kill('SIGKILL')
        repairModesAround(chrome)
        child = spawn(chrome, chromeArgs(profileDir, width, height), { stdio: ['ignore', 'ignore', 'pipe'] })
        endpoint = await this.awaitEndpoint(child)
      }
      cdp = new CdpConnection(endpoint)
      await cdp.ready()
    } catch (error: unknown) {
      child.kill('SIGKILL')
      rmSync(profileDir, { recursive: true, force: true })
      throw error
    }

    const browserId = `browser-${String(this.nextId++)}` as OperatorBrowserId
    const record: BrowserRecord = {
      view: { browserId, workspaceId: spec.workspaceId, url: spec.url, title: '', width, height, live: true },
      process: child, cdp, sessionId: '', targetId: '', profileDir, lastFrame: undefined,
    }
    this.browsers.set(browserId, record)
    try {
      await this.attach(record, spec.url, width, height)
    } catch (error: unknown) {
      await this.close(browserId)
      throw error
    }
    this.ctx.emit('operator-browser/changed', this.list())
    return { ...record.view }
  }

  /**
   * Point this browser at another address.
   * @param browserId - the browser to navigate.
   * @param url - the address.
   */
  async navigate(browserId: OperatorBrowserId, url: string): Promise<void> {
    assertNavigable(url)
    const record = this.live(browserId)
    await record.cdp.sendTo(record.sessionId, 'Page.navigate', { url })
  }

  /**
   * Forward a pointer gesture.
   * @param browserId - the browser to drive.
   * @param pointer - the gesture, in the page's own coordinates.
   */
  async pointer(browserId: OperatorBrowserId, pointer: OperatorBrowserPointer): Promise<void> {
    const record = this.live(browserId)
    await record.cdp.sendTo(record.sessionId, 'Input.dispatchMouseEvent', {
      type: pointer.type,
      x: pointer.x,
      y: pointer.y,
      button: pointer.type === 'mouseMoved' ? 'none' : 'left',
      clickCount: pointer.clickCount ?? (pointer.type === 'mouseMoved' ? 0 : 1),
      ...pointer.deltaX === undefined ? {} : { deltaX: pointer.deltaX },
      ...pointer.deltaY === undefined ? {} : { deltaY: pointer.deltaY },
    })
  }

  /**
   * Forward a keyboard gesture.
   * @param browserId - the browser to drive.
   * @param key - the gesture.
   */
  async key(browserId: OperatorBrowserId, key: OperatorBrowserKey): Promise<void> {
    const record = this.live(browserId)
    await record.cdp.sendTo(record.sessionId, 'Input.dispatchKeyEvent', {
      type: key.type,
      ...key.key === undefined ? {} : { key: key.key },
      ...key.code === undefined ? {} : { code: key.code },
      ...key.text === undefined ? {} : { text: key.text },
      modifiers: key.modifiers ?? 0,
    })
  }

  /**
   * Tell the page its viewport changed.
   * @param browserId - the browser to resize.
   * @param width - viewport width the panel measures.
   * @param height - viewport height the panel measures.
   */
  async resize(browserId: OperatorBrowserId, width: number, height: number): Promise<void> {
    const record = this.live(browserId)
    record.view.width = clampSize(width)
    record.view.height = clampSize(height)
    await this.applyViewport(record, record.view.width, record.view.height)
  }

  /**
   * The most recent frame, so a reopened panel paints immediately.
   * @param browserId - the browser to read.
   * @returns the frame as base64, or undefined before the first paint.
   */
  lastFrame(browserId: OperatorBrowserId): string | undefined {
    return this.record(browserId).lastFrame
  }

  /**
   * Every browser this service holds, live and closed alike.
   *
   * Sent whole rather than as a delta so two panels watching the same Host
   * converge on the same list instead of each keeping its own running total.
   * @returns a view of every browser the service holds.
   */
  list(): OperatorBrowserView[] {
    return [...this.browsers.values()].map(record => ({ ...record.view }))
  }

  /**
   * The live browser for one workspace, if any.
   * @param workspaceId - the workspace to look in.
   * @returns its newest live browser's id, or undefined.
   */
  liveIn(workspaceId: string): OperatorBrowserId | undefined {
    return [...this.browsers.values()].reverse()
      .find(record => record.view.live && record.view.workspaceId === workspaceId)?.view.browserId
  }

  /**
   * End a browser and forget it.
   * @param browserId - the browser to close.
   */
  async close(browserId: OperatorBrowserId): Promise<void> {
    const record = this.browsers.get(browserId)
    if (record === undefined) return
    this.browsers.delete(browserId)
    record.view.live = false
    await this.teardown(record)
    if (!this.disposing) this.ctx.emit('operator-browser/changed', this.list())
  }

  /**
   * Attach to the browser's page target and start the stream.
   * @param record - the browser to attach to.
   * @param url - the first address.
   * @param width - viewport width.
   * @param height - viewport height.
   */
  private async attach(record: BrowserRecord, url: string, width: number, height: number): Promise<void> {
    const targets = await record.cdp.send('Target.getTargets')
    const infos = (targets['targetInfos'] ?? []) as { targetId: string; type: string }[]
    const page = infos.find(info => info.type === 'page')
    const targetId = page === undefined
      ? String((await record.cdp.send('Target.createTarget', { url: 'about:blank' }))['targetId'])
      : page.targetId
    const attached = await record.cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const sessionId = String(attached['sessionId'])
    // Every later message is addressed to the page's session rather than to
    // the browser: the browser-level connection can enumerate targets and
    // nothing else.
    record.sessionId = sessionId
    record.targetId = targetId
    record.cdp.on((event) => {
      if (event.method === 'Page.screencastFrame') {
        const data = String(event.params['data'])
        record.lastFrame = data
        this.ctx.emit('operator-browser/frame', record.view.browserId, data)
        // The acknowledgement is what paces the stream: without it the browser
        // stops after a handful of frames and the page appears to freeze.
        void record.cdp.sendTo(record.sessionId, 'Page.screencastFrameAck', { sessionId: Number(event.params['sessionId']) })
        return
      }
      if (event.method === 'Page.frameNavigated') {
        const frame = event.params['frame'] as { url?: string; parentId?: string } | undefined
        // Only the main frame: an ad iframe navigating is not the page moving.
        if (frame?.url === undefined || frame.parentId !== undefined) return
        record.view.url = frame.url
        if (!this.disposing) this.ctx.emit('operator-browser/changed', this.list())
      }
    })
    await record.cdp.sendTo(sessionId, 'Page.enable')
    await record.cdp.sendTo(sessionId, 'Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    await record.cdp.sendTo(sessionId, 'Page.navigate', { url })
    await this.startScreencast(record, width, height)
    // And then again, at the same size. The first screencast is bounded by the
    // surface that exists when it starts, and at this moment that surface is
    // the LAUNCH window minus the window chrome — 143px shorter than asked for,
    // whatever `--window-size` said. Re-applying the metrics against a surface
    // that now exists and restarting is what makes the frame the size the panel
    // asked for; without it every browser opens letterboxed and only straightens
    // out when someone happens to drag the panel.
    await this.applyViewport(record, width, height)
  }

  /**
   * Put the page and its screencast on the same viewport.
   *
   * The screencast's bounds are fixed at the moment it starts, so telling the
   * page it is taller is only half the job: the frames keep arriving at the OLD
   * size, and the panel letterboxes a page that is in fact filling its viewport.
   * Restarting is the only way to move those bounds.
   * @param record - the browser to apply it to.
   * @param width - viewport width.
   * @param height - viewport height.
   */
  private async applyViewport(record: BrowserRecord, width: number, height: number): Promise<void> {
    await record.cdp.sendTo(record.sessionId, 'Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    await record.cdp.sendTo(record.sessionId, 'Page.stopScreencast')
    await this.startScreencast(record, width, height)
  }

  /**
   * Make the page the active one, then start its screencast.
   *
   * The screencast refuses a target that is not active, and headless Chrome
   * has no window manager to have made one active. Two things are needed and
   * neither alone is enough: `Target.activateTarget` at the BROWSER level is
   * what actually promotes the target (`Page.bringToFront` on its own answers
   * `Not attached to an active page` every time), and the promotion does not
   * take effect by the time the command's own reply arrives — a
   * `startScreencast` sent immediately after it fails on the first attempt and
   * succeeds on the second, reproducibly, on a fresh browser.
   *
   * So the sequence is retried rather than sent once and hoped over, and ONLY
   * this error is retried: any other protocol failure is a real one and is
   * raised where it happened.
   * @param record - the browser being attached.
   * @param width - viewport width, and the frame's own width bound.
   * @param height - viewport height, and the frame's own height bound.
   */
  private async startScreencast(record: BrowserRecord, width: number, height: number): Promise<void> {
    for (let attempt = 0; attempt < SCREENCAST_ATTEMPTS; attempt++) {
      try {
        await record.cdp.send('Target.activateTarget', { targetId: record.targetId })
        await record.cdp.sendTo(record.sessionId, 'Page.bringToFront')
        await record.cdp.sendTo(record.sessionId, 'Page.startScreencast', {
          format: 'jpeg', quality: this.config.frameQuality, maxWidth: width, maxHeight: height,
        })
        return
      } catch (error: unknown) {
        const inactive = error instanceof Error && error.message.includes('Not attached to an active page')
        if (!inactive || attempt === SCREENCAST_ATTEMPTS - 1) throw error
        await new Promise<void>((resolve) => { setTimeout(resolve, SCREENCAST_RETRY_MS) })
      }
    }
  }

  /**
   * Wait for the browser to say where its debugger is listening.
   * @param child - the browser process.
   * @returns the websocket endpoint.
   */
  private awaitEndpoint(child: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffered = ''
      const timer = setTimeout(() => {
        // A browser that never printed the line is one that failed to start;
        // its own stderr is the only thing that can say why, so it goes in the
        // message rather than being replaced by a timeout with no cause.
        reject(new OperatorBrowserError(
          'NO_CHROME',
          `the browser did not report a debugging endpoint within ${String(this.config.startupTimeoutSeconds)}s: ${buffered.slice(-400)}`,
        ))
      }, this.config.startupTimeoutSeconds * 1000)
      child.stderr?.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8')
        const endpoint = endpointFrom(buffered)
        if (endpoint === undefined) return
        clearTimeout(timer)
        resolve(endpoint)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new OperatorBrowserError('NO_CHROME', `the browser exited with code ${String(code)}: ${buffered.slice(-400)}`))
      })
      // A spawn that never starts emits 'error' and NOT 'exit'. Node throws an
      // unhandled 'error' event, so without this listener a browser that
      // cannot be executed does not fail the tool call — it takes the whole
      // process down, which is what an EACCES on the carried payload did.
      child.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        reject(new OperatorBrowserError(
          'NO_CHROME',
          `the browser could not be started (${error.code ?? 'spawn failed'}): ${error.message}`,
        ))
      })
    })
  }

  /**
   * Put the executable bit back on the carried browser.
   *
   * npm normalises file modes on extract — only what a package declares in
   * `bin` keeps `+x` — so every binary in a payload package arrives 0644 and
   * `spawn` answers EACCES. The payload is otherwise correct, and repairing the
   * modes is cheaper for everyone than republishing several hundred megabytes
   * per platform.
   *
   * Guarded by the pinned executable's own mode, so this walks the payload once
   * per install rather than once per open. Every regular file gets the bit
   * rather than a list of names: Chromium's launchable pieces are the browser,
   * its crashpad handler, its sandbox helper, its wrapper script and — on macOS
   * — nine more inside the .app's `MacOS`, `Helpers` and `Libraries`
   * directories, and a list that missed one would fail only on the platform
   * nobody tested. The bit on a `.pak` is inert.
   *
   * Failure is swallowed: a read-only or root-owned install cannot be repaired
   * here, and the spawn that follows reports that far more precisely than a
   * chmod's errno would.
   */
  private repairCarriedModes(): void {
    try {
      const manifestPath = this.probe.manifest(
        `@unieai/rabi-chromium-${process.platform}-${process.arch}/chromium.json`,
      )
      if (manifestPath === undefined) return
      const manifest = this.probe.readManifest(manifestPath)
      if (typeof manifest?.executable !== 'string') return
      const payload = join(dirname(manifestPath), 'browser')
      accessSync(join(payload, manifest.executable), constants.X_OK)
    } catch {
      // Either there is no carried payload, or its executable is not runnable
      // yet. The second case is the one to repair; the first returned above.
      this.chmodPayload()
    }
  }

  /** Walk the carried payload and make every regular file executable. */
  private chmodPayload(): void {
    const manifestPath = this.probe.manifest(
      `@unieai/rabi-chromium-${process.platform}-${process.arch}/chromium.json`,
    )
    if (manifestPath === undefined) return
    const payload = join(dirname(manifestPath), 'browser')
    try {
      chmodTree(payload)
    } catch {
      // Partially repaired is still better than not; spawn reports the rest.
    }
  }

  /**
   * @param browserId - the browser to look up.
   * @returns its record.
   */
  private record(browserId: OperatorBrowserId): BrowserRecord {
    const record = this.browsers.get(browserId)
    if (record === undefined) throw new OperatorBrowserError('NO_BROWSER', `no browser ${browserId}`)
    return record
  }

  /**
   * @param browserId - the browser to look up.
   * @returns its record, having proved it is still running.
   */
  private live(browserId: OperatorBrowserId): BrowserRecord {
    const record = this.record(browserId)
    if (!record.view.live) throw new OperatorBrowserError('CLOSED', `browser ${browserId} has closed`)
    return record
  }

  /**
   * End one browser's process, connection and profile.
   * @param record - the browser to end.
   */
  private async teardown(record: BrowserRecord): Promise<void> {
    record.cdp.close()
    record.process.kill()
    await new Promise<void>((resolve) => {
      if (record.process.exitCode !== null || record.process.signalCode !== null) { resolve(); return }
      const forced = setTimeout(() => { record.process.kill('SIGKILL'); resolve() }, 2000)
      record.process.once('exit', () => { clearTimeout(forced); resolve() })
    })
    // The profile is this package's, created per browser, so removing it takes
    // nothing a person owns. It is retried because Chrome's own helper
    // processes keep writing into it for a moment after the parent exits, and
    // a failure is swallowed because a leftover directory under the system
    // temp is a smaller problem than a teardown that throws — the caller is
    // usually a scope disposing, and it has nothing to do with the news.
    try {
      rmSync(record.profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      // Left for the operating system's own temp reaping.
    }
  }

  /** End every browser and await quiescence. */
  private async disposeAll(): Promise<void> {
    this.disposing = true
    const records = [...this.browsers.values()]
    this.browsers.clear()
    await Promise.all(records.map(record => this.teardown(record)))
  }
}

/**
 * Refuse an address this panel will not open.
 *
 * `http`/`https` only. `file:` would turn a URL bar into a reader for the host
 * filesystem, and the schemes a browser treats specially — `javascript:`,
 * `chrome:`, `devtools:` — reach the browser itself rather than a page.
 * @param url - the address to check.
 */
function assertNavigable(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new OperatorBrowserError('BLOCKED_URL', `not a URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OperatorBrowserError('BLOCKED_URL', `${parsed.protocol} is not an address this panel opens`)
  }
}

/**
 * Clamp a client-reported dimension.
 *
 * The caller is a layout: a hidden or half-mounted panel measures zero, and a
 * viewport of zero is one no page can render into.
 * @param value - dimension as measured by the client.
 * @returns a positive integer.
 */
function clampSize(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.trunc(value))
}

/**
 * Make every regular file under a directory executable.
 *
 * Every file rather than a list of names: Chromium's launchable pieces are the
 * browser, its crashpad handler, its sandbox helper, its wrapper script and —
 * on macOS — nine more inside the .app's `MacOS`, `Helpers` and `Libraries`
 * directories, and a list that missed one would fail only on the platform
 * nobody tested. The bit on a `.pak` is inert. Symlinks are skipped by both
 * branches: a macOS framework's links point at files this walk reaches by
 * their real path anyway.
 * @param root - directory to walk.
 */
function chmodTree(root: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) chmodTree(path)
    else if (entry.isFile()) chmodSync(path, 0o755)
  }
}

/**
 * Whether a failed launch was a permission problem rather than a bad browser.
 *
 * Read off the message the spawn error carried into {@link OperatorBrowserError}:
 * the errno is what distinguishes "the payload arrived without its executable
 * bit" from "this is not a browser", and only the first is worth repairing.
 * @param error - the failure `awaitEndpoint` rejected with.
 * @returns true when the executable could not be executed.
 */
function isNotExecutable(error: unknown): boolean {
  return error instanceof OperatorBrowserError && /\bEACCES\b|\bEPERM\b/.test(error.message)
}

/**
 * Put the executable bit back on a carried payload, found from its executable.
 *
 * {@link OperatorBrowserService.repairCarriedModes} finds the payload by
 * resolving the platform package's manifest; this one starts from the path that
 * just refused to run and walks up to the `browser/` directory the payload is
 * published under, so it works in an install layout that resolution cannot see.
 * Every regular file gets the bit for the reason the manifest walk does: a list
 * of names that missed one of Chromium's helpers would fail only on the
 * platform nobody tested.
 *
 * Failure is swallowed. A read-only or root-owned install cannot be repaired
 * from here, and the retry that follows reports that more precisely.
 * @param executable - the path whose spawn answered EACCES.
 */
function repairModesAround(executable: string): void {
  try {
    const segments = executable.split(sep)
    const index = segments.lastIndexOf('browser')
    const root = index === -1 ? undefined : segments.slice(0, index + 1).join(sep)
    if (root === undefined) {
      chmodSync(executable, 0o755)
      return
    }
    chmodTree(root)
  } catch {
    // Unrepairable here; the retry's own failure names the cause.
  }
}

export default OperatorBrowserService
