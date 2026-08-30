// Web e2e scenario: the Connections settings page over the shipped Web
// composition. What it proves is that the whole path is real — the connector
// book the bundle mounts, the host route, the wire schema, and the section —
// and that the page tells the truth about a connector this build cannot
// connect: Google and Microsoft are listed, marked as needing an application
// registered with the vendor, and their buttons are plainly unavailable
// rather than offering a click that could only fail.
//
// Zero model calls: nothing here reaches the llm seam, so a stray stream
// would fail loud.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/connector-settings', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: Connections settings', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    // CI uses Playwright's pinned browser. A developer may point this one
    // scenario at an installed Chromium when the matching browser download is
    // temporarily unavailable.
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    // The Chinese surface, so the golden pins the registered dictionary
    // rather than a test-local translation callback.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('lists the shipped connectors, and says which ones this build cannot connect', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-connector-settings'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })

    await dialog.getByRole('button', { name: '连接', exact: true }).click()
    // The list is read from the host when the page opens; the first row
    // arriving is what says the whole path answered.
    await dialog.getByText('Notion').waitFor({ timeout: 10_000 })

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)

    // A connector that registers itself needs nothing configured, so its
    // button works on a fresh install.
    const rows = dialog.locator('li')
    const notion = rows.filter({ hasText: 'Notion' }).first()
    expect(await notion.getByRole('button', { name: '连接' }).isEnabled()).toBe(true)

    // Google needs an application registered with Google, and this build was
    // given no client id. The row says so, and the button cannot be pressed.
    const google = rows.filter({ hasText: 'Google' }).first()
    expect(await google.textContent()).toContain('需要先在该服务注册一个应用程序')
    expect(await google.getByRole('button', { name: '连接' }).isDisabled()).toBe(true)

    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', () => {
    expect(tripwire.warnings).toEqual([])
    return assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })
})
