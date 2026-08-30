// Web e2e scenario: the configurable tab in Plugins settings — the cards a
// deployment's exposed host-plane namespaces produce, one field edited through the real
// wire down to `$DSH_HOME/settings.yaml`, and the override badge and reset
// that layering produces. Zero model calls: everything is client state plus
// the settings document on a blank frame, so there is no fixture and a stray
// stream would fail loud on the open llm seam.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { join } from 'node:path'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/plugin-config', import.meta.url))
const SECTION_EXPECTED = join(SNAPSHOT_DIR, 'section.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: plugin configuration section', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // Chinese browser: the section asserts the localized copy the client
    // derives from it, as the rest of the settings surface does.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /**
   * Open the plugin configuration cards.
   *
   * NOT the settings dialog any more. `ui-settings-plugins` moved from a
   * `settings.section` to a `plugins.page.area`, so the destination is the
   * sidebar's Plugins page and the cards sit under its "Plugin settings"
   * view; the settings shell hides its old Plugins nav row exactly when no
   * `plugins` section is registered, which this move makes true. The section,
   * its tabs and its cards are otherwise unchanged.
   *
   * The scenarios share one page and the settings document accumulates across
   * them, so this leaves the page already open where it is rather than
   * toggling it shut.
   */
  async function openPlugins() {
    const surface = page.locator('[data-plugins-page]')
    if (await surface.count() === 0) {
      await page.getByRole('button', { name: '插件', exact: true }).click()
      await surface.waitFor({ timeout: 10_000 })
    }
    // The manage view holds the configuration area; the tab strip above it is
    // the page's own (directory / skills) and does not reach it.
    if (await surface.getByRole('tab', { name: '插件配置', exact: true }).count() === 0) {
      await surface.getByRole('button', { name: '插件设置', exact: true }).click()
    }
    await expect
      .poll(() => surface.getByRole('tab', { name: '插件配置', exact: true }).getAttribute('aria-selected'), { timeout: 10_000 })
      .toBe('true')
    return surface
  }


  /**
   * Expand the shell executor's card and answer its timeout field.
   *
   * Idempotent: the scenarios share one page and the page now stays open
   * between them, so a card left expanded by the previous scenario would be
   * COLLAPSED by an unconditional click.
   * @param surface - the Plugins page.
   * @returns the timeout field, visible.
   */
  async function bashTimeout(surface: Locator) {
    const timeout = surface.getByLabel('命令超时（毫秒）')
    if (await timeout.count() === 0) await surface.getByText('终端', { exact: true }).click()
    await timeout.waitFor({ timeout: 10_000 })
    return timeout
  }

  /** The settings document as the Host has written it so far. */
  async function settingsDocument(): Promise<string> {
    return readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8').catch(() => '')
  }

  it('shows one card per exposed host-plane namespace', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-config-cards'))
    const surface = await openPlugins()

    // Every card the shipped web composition exposes: the shell executor, the
    // agent loop, and the DeepSeek search provider.
    await surface.getByText('终端', { exact: true }).waitFor({ timeout: 10_000 })
    expect(await surface.getByText('Agent 循环', { exact: true }).count()).toBe(1)
    expect(await surface.getByText('网页搜索', { exact: true }).count()).toBe(1)
    // Collapsed: a card's fields appear only once it is expanded.
    expect(await surface.getByLabel('命令超时（毫秒）').count()).toBe(0)

    const snapshot = await captureStableAria(page, '[data-plugins-page]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SECTION_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('stages an edit and writes it only when saved', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-config-write'))
    const surface = await openPlugins()
    const timeout = await bashTimeout(surface)
    // The composed default this deployment ships, before any user layer.
    expect(await timeout.inputValue()).toBe('60000')
    await timeout.fill('12000')
    await timeout.blur()

    // Nothing crosses the wire until the user saves: leaving the control is
    // not a decision to store the value.
    expect(await settingsDocument()).not.toContain('timeoutMs')
    const save = surface.getByRole('button', { name: '保存', exact: true })
    await expect.poll(() => save.isEnabled(), { timeout: 5_000 }).toBe(true)
    await save.click()

    await expect.poll(async () => (await settingsDocument()).includes('timeoutMs: 12000'), { timeout: 10_000 })
      .toBe(true)
    // Presence in the user layer is what the badge reports, and the reset is
    // offered only for a field that has one.
    await expect.poll(() => surface.getByText('已覆盖').count(), { timeout: 5_000 }).toBe(1)
    expect(await surface.getByRole('button', { name: '恢复默认' }).count()).toBe(1)
    // A settled form offers no save to repeat.
    await expect.poll(() => save.isDisabled(), { timeout: 5_000 }).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('drops a staged edit on discard without touching the document', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-config-discard'))
    const surface = await openPlugins()
    const timeout = await bashTimeout(surface)

    await timeout.fill('7000')
    await surface.getByRole('button', { name: '放弃修改' }).click()

    await expect.poll(() => timeout.inputValue(), { timeout: 5_000 }).toBe('12000')
    expect(await settingsDocument()).toContain('timeoutMs: 12000')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('refuses to save a draft that is not a number', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-config-invalid'))
    const surface = await openPlugins()
    const timeout = await bashTimeout(surface)

    await timeout.fill('soon')

    const save = surface.getByRole('button', { name: '保存', exact: true })
    await expect.poll(() => save.isDisabled(), { timeout: 5_000 }).toBe(true)
    expect(await surface.getByText('请填数字；留空表示使用默认值。').count()).toBe(1)
    await surface.getByRole('button', { name: '放弃修改' }).click()
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('clears the field back to the composed default on reset', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-config-reset'))
    const surface = await openPlugins()
    const timeout = await bashTimeout(surface)
    expect(await timeout.inputValue()).toBe('12000')

    // The reset stages the composed default; the document still carries the
    // override until the save lands.
    await surface.getByRole('button', { name: '恢复默认' }).click()
    await expect.poll(() => timeout.inputValue(), { timeout: 5_000 }).toBe('60000')
    expect(await settingsDocument()).toContain('timeoutMs: 12000')

    await surface.getByRole('button', { name: '保存', exact: true }).click()

    await expect.poll(async () => (await settingsDocument()).includes('timeoutMs'), { timeout: 10_000 })
      .toBe(false)
    expect(await timeout.inputValue()).toBe('60000')
    expect(await surface.getByText('已覆盖').count()).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['section.expected.md'])
  })
})
