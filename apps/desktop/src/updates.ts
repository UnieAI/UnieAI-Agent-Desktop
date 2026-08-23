/**
 * Update checking, and the one platform where it cannot install for itself.
 *
 * ON macOS AN UNSIGNED APP CANNOT AUTO-UPDATE. Electron's own documentation is
 * explicit: "Your application must be signed for automatic updates on macOS.
 * This is a requirement of Squirrel.Mac." An unsigned build that called
 * `quitAndInstall` there would fail at the last step, after downloading, with
 * the user having been told an update was on its way — worse than never having
 * offered. So macOS checks and TELLS, opening the release page for a download
 * the person performs themselves.
 *
 * Windows has no such requirement: NSIS installs an unsigned update fine, and
 * the only cost of being unsigned is SmartScreen's warning on first install.
 * So Windows downloads and installs.
 *
 * The split lives here rather than in a build flag because it is a fact about
 * the platform, not a preference. The day this app ships with a Developer ID,
 * the macOS branch becomes the Windows one and nothing else changes.
 */

import { app, dialog, shell } from 'electron'
import updater from 'electron-updater'

/** Where a person goes to download a build this app cannot install for them. */
const RELEASES_URL = 'https://github.com/UnieAI/UnieAI-Agent-Desktop/releases/latest'

/**
 * Whether this build may install an update it downloads.
 *
 * A single honest constant, not a probe. Electron exposes no way to ask
 * whether the running bundle is signed, and the plausible substitutes — asking
 * Squirrel to accept a feed and watching for a throw, reading the bundle's
 * own path — answer a different question and would eventually answer it wrong.
 * A wrong "yes" here is the bad direction: it downloads, promises an install,
 * and fails at the last step.
 *
 * WHAT TO CHANGE WHEN THIS APP GETS AN APPLE DEVELOPER ID: delete the darwin
 * case. Signing and notarising is the whole of what macOS needs — the download
 * and install path below is already the one Windows takes, and it becomes
 * correct on macOS the moment the bundle is signed.
 */
const CAN_SELF_INSTALL = process.platform !== 'darwin'

/**
 * Check for an update once, and act on what is found.
 *
 * Failure is silent by design: an update check that cannot reach the network
 * is not something to interrupt someone's work with, and the next launch
 * checks again.
 * @returns a promise settling when the check has been made.
 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return
  const auto = updater.autoUpdater
  auto.autoDownload = CAN_SELF_INSTALL

  auto.on('update-available', (info: { version: string }) => {
    if (CAN_SELF_INSTALL) return
    void dialog.showMessageBox({
      type: 'info',
      message: `UnieAI Agent ${info.version} is available`,
      detail: 'This build cannot install updates for itself, so the download page will open in your browser.',
      buttons: ['Open download page', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) void shell.openExternal(RELEASES_URL)
    })
  })

  auto.on('update-downloaded', (info: { version: string }) => {
    void dialog.showMessageBox({
      type: 'info',
      message: `UnieAI Agent ${info.version} is ready`,
      detail: 'Restart to finish installing. Your sessions are on disk and survive the restart.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) auto.quitAndInstall()
    })
  })

  await auto.checkForUpdates().catch(() => undefined)
}
