/**
 * Launching a Chromium and speaking CDP to it, as a reusable face.
 *
 * The operator browser is one consumer of this; a screenshot tool is another,
 * and they share nothing else. Everything here is about getting a browser
 * running and talking to it — no registry, no workspace, no person.
 * @module @unieai/uad-browser-operator/chromium
 */

export { CHROME_PATH_VARIABLE, chromeArgs, resolveChrome, type ChromeProbe } from './chrome.ts'
export { CdpConnection, endpointFrom, type CdpEvent } from './cdp.ts'
export { FILESYSTEM_CHROME_PROBE } from './probe.ts'
