/**
 * The desktop shell: one window over a harness this process starts and owns.
 *
 * Everything the product does lives in the harness. This file starts it, shows
 * it, and takes it down — and deliberately adds no behaviour of its own, so
 * that what someone runs from an installer is what the rest of this repository
 * already tests. A shell that grew its own features would be a second product
 * with no tests behind it.
 *
 * The window loads a loopback URL rather than a file. That is what makes the
 * whole client stack — service workers, the API route, the websocket downlink —
 * work exactly as it does in a browser, and it is why `nodeIntegration` is off
 * and `contextIsolation` on: the page is a web page, and giving it Node would
 * be handing the harness's own privileges to the document it serves.
 *
 * FAILURE IS SHOWN, NOT SWALLOWED. A harness that cannot start leaves an
 * ordinary desktop app with a blank window and no way to find out why. This one
 * renders what the harness wrote before it stopped, because that text is the
 * answer and there is nowhere else for a person to read it.
 */

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { HarnessStartError, startHarness, type RunningHarness } from './harness.ts'
import { checkForUpdates } from './updates.ts'

/** The harness backing the open window, once it is running. */
let harness: RunningHarness | undefined

/** Opening size. Wide enough for the sidebar, the conversation and the details column. */
const WINDOW = { width: 1280, height: 860, minWidth: 720, minHeight: 480 }

/**
 * Build the window every path uses.
 * @returns the created window.
 */
function createWindow(): BrowserWindow {
  return new BrowserWindow({
    ...WINDOW,
    show: false,
    backgroundColor: '#101010',
    // A title the harness overwrites as soon as the page loads; it exists so a
    // window manager has something better than the executable name to show
    // during the moment before that.
    title: 'UnieAI Agent',
    // Linux takes the icon from the window; macOS and Windows take it from the
    // packaged bundle, where naming one here would be ignored. Spread rather
    // than `undefined`, which `exactOptionalPropertyTypes` refuses.
    ...process.platform === 'linux' ? { icon: join(app.getAppPath(), 'build', 'icon.png') } : {},
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
}

/**
 * Show why the harness did not start, in the window that would have shown it.
 *
 * The text is rendered as a data URL rather than a bundled page: a failure
 * page that itself has to load from somewhere is one more thing that can fail
 * at exactly the moment nothing else is working.
 * @param window - the window to render into.
 * @param error - the failure to explain.
 */
async function showFailure(window: BrowserWindow, error: HarnessStartError): Promise<void> {
  const escape = (text: string): string => text
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const page = `<!doctype html><meta charset="utf-8"><title>UnieAI Agent</title>
<style>
  :root { color-scheme: dark }
  body { margin: 0; padding: 48px; background: #101010; color: #e8e8e8;
         font: 14px/1.6 -apple-system, "Segoe UI", system-ui, sans-serif }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600 }
  p { margin: 0 0 24px; color: #9a9a9a }
  pre { margin: 0; padding: 16px; overflow: auto; max-height: 60vh; border-radius: 8px;
        background: #181818; color: #c8c8c8; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace }
</style>
<h1>UnieAI Agent could not start</h1>
<p>${escape(error.message)}</p>
<pre>${escape(error.output.trim() || 'The harness wrote nothing before it stopped.')}</pre>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
}

/**
 * Start the harness, then show it.
 * @returns a promise settling once the window has content.
 */
async function open(): Promise<void> {
  const window = createWindow()
  window.once('ready-to-show', () => { window.show() })

  // Links to anywhere but the harness open in the real browser. A desktop
  // window that navigated to an external site would strand the person there
  // with no address bar and no way back.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  try {
    const home = join(app.getPath('userData'), 'harness')
    console.log(`dsh-desktop: starting the harness with DSH_HOME=${home}`)
    harness = await startHarness({ home })
    console.log(`dsh-desktop: harness ready at ${harness.url}`)
    await window.loadURL(harness.url)
  } catch (error) {
    if (!(error instanceof HarnessStartError)) throw error
    // Logged as well as shown. The window is where the person reads it, but a
    // window is not somewhere a bug report can be copied from, and a headless
    // run has no window at all — this text is the only account of why the
    // harness did not start.
    console.error(`dsh-desktop: ${error.message}\n${error.output}`)
    await showFailure(window, error)
  }
}

/** Stop the harness. Idempotent, because both quit paths below reach it. */
function stopHarness(): void {
  harness?.stop()
  harness = undefined
}

// A second launch focuses the window this one already owns. Without the lock,
// each launch would start its own harness against the same DSH_HOME, and two
// harnesses writing one session store is a corruption, not a race.
if (!app.requestSingleInstanceLock()) {
  // Say so. A second launch quitting in silence is indistinguishable from one
  // that crashed before drawing anything, and that ambiguity sent me looking
  // for a harness that was never going to start.
  console.log('dsh-desktop: another instance already owns this profile; focusing it')
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(async () => {
    await open()
    void checkForUpdates()
    // macOS keeps the process alive with no windows; the dock icon reopens one.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void open()
    })
  }, (error: unknown) => {
    console.error('dsh-desktop: failed to open', error)
    app.quit()
  })

  // Everywhere but macOS, closing the last window ends the app — and the
  // harness with it, which is the point: it is this app's child, not a service
  // the machine keeps running.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', stopHarness)
  // A crash of this process still has to take the harness down; `exit` fires
  // where `before-quit` does not.
  process.on('exit', stopHarness)
}
