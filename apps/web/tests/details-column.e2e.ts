// Web e2e: the details column actually opens.
//
// Every other assertion on `data-details-collapsed` in this suite checks that
// it is 'true' — that the column stays SHUT for a bash row, a file link, a
// blank session. Nothing asserted it ever opens, so when it stopped opening
// entirely the suite stayed green.
//
// It stopped because `closeDocument` used to zero the column's width
// unconditionally, and univer's document host calls that from an effect keyed
// on its own props whenever its window count is zero — every render on a page
// with no document. The toggle set the width, the next render took it away.
// This test is the one that would have said so.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot, viewToggle } from './support.ts'

const SEED = join(fileURLToPath(new URL('./snapshots/navigation-panes', import.meta.url)), 'seed.jsonl')
const SEED_ID = 'details-column-web-e2e'

describe('web e2e: the details column opens', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(SEED, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const welcome = page.locator('[class*="onboardingOverlay"]')
    if (await welcome.count() > 0) {
      await welcome.getByRole('button').click()
      await welcome.waitFor({ state: 'detached', timeout: 15_000 })
    }
    // Open the seeded session: the column's width is gated on a non-blank one.
    const search = page.getByRole('button', { name: 'Search sessions' })
    if (await search.getAttribute('aria-expanded') !== 'true') await search.click()
    await page.getByPlaceholder('Search sessions', { exact: false }).fill('WATERFALL')
    const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
    await result.first().waitFor({ timeout: 20_000 })
    await result.first().click()
    await viewToggle(page).waitFor({ timeout: 20_000 })
  }, 180_000)

  afterAll(async () => { await browser?.close(); await scaffold?.close() })

  /** The frame's third grid track in pixels — the details column's real width. */
  const detailsWidth = (target: Page): Promise<number> =>
    target.locator('[style*="grid-template-columns"]').first().evaluate((el) => {
      const track = getComputedStyle(el).gridTemplateColumns.split(/\s+/).at(-1) ?? '0px'
      return Number.parseFloat(track)
    })

  it('the header toggle opens the column, and closes it again', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-details-column'))
    const frame = page.locator('[style*="grid-template-columns"]').first()
    expect(await frame.getAttribute('data-details-collapsed')).toBe('true')
    expect(await detailsWidth(page)).toBe(0)

    const toggle = page.getByRole('button', { name: 'Open the details panel' })
    await toggle.click()
    // Width, not just a mounted panel: the content mounts either way, and it
    // was mounting at 441px inside a zero-width column while this was broken.
    await expect.poll(() => detailsWidth(page), { timeout: 10_000 }).toBeGreaterThan(0)
    await expect.poll(() => frame.getAttribute('data-details-collapsed'), { timeout: 5_000 }).toBe(null)

    // The same control both ways: a button that only opens leaves its own
    // pressed state contradicting the panel.
    await toggle.click()
    await expect.poll(() => detailsWidth(page), { timeout: 10_000 }).toBe(0)
  }, 90_000)

  // Which ROWS open the column is navigation-panes' subject (bash rows and
  // file links deliberately leave it shut); this file's subject is that the
  // column can be opened at all.
})
