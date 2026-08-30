// Web e2e: where the machine control is drawn, and that there is only one.
//
// The control names where the agent's tools run. It used to render in the
// composer's tool row in every phase, while the hero ALSO drew a passive
// laptop glyph beside the workspace chip — two laptops on one screen, only one
// of them clickable, and the passive one labelled itself from the page's own
// authority (`connection.isLoopback`) rather than from the selected machine,
// so it read "this computer" even after picking a remote one.
//
// The rule now: on the hero, the row below the card IS the composer's resident
// chrome, so the seat renders there; once a conversation is running that row is
// gone and the seat renders in the card, where it stays reachable mid-turn
// (switching machines applies immediately, so it has to be reachable then).
// Zero model calls: chrome placement over a seeded session.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot, viewToggle } from './support.ts'

const SEED = join(fileURLToPath(new URL('./snapshots/navigation-panes', import.meta.url)), 'seed.jsonl')
const SEED_ID = 'machine-control-web-e2e'

describe('web e2e: machine control placement', () => {
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
  }, 180_000)

  afterAll(async () => { await browser?.close(); await scaffold?.close() })

  /** Every machine trigger on the page, whatever phase it is drawn in. */
  const controls = (target: Page) => target.getByRole('button', { name: /^Machine:/ })

  it('the hero draws exactly one machine control, in the row below the card', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-machine-control-hero'))
    await expect.poll(() => controls(page).count(), { timeout: 20_000 }).toBe(1)
    // In the row below the card, not inside the composer's own tool row: the
    // two-laptop screen is exactly what a second seat here would recreate.
    const inHeroRow = await controls(page).first().evaluate(el =>
      el.closest('[class*="heroWorkspaceRow"]') !== null)
    expect(inHeroRow, 'the hero seat renders in the workspace row below the card').toBe(true)
  }, 60_000)

  it('opens downward on the hero, inside the window, first row included', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-machine-menu-fits'))
    // Why this matters beyond looks: "This computer" is the FIRST row, so a
    // menu that overflows the top edge takes the way back to local with it —
    // the machine you can always reach becomes the one you cannot pick.
    await controls(page).first().click()
    const menu = page.getByRole('menu')
    await menu.waitFor({ timeout: 10_000 })
    const fit = await menu.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const first = el.querySelector('[role="menuitem"]')?.getBoundingClientRect()
      return {
        side: el.getAttribute('data-side'),
        overflowsTop: box.top < 0,
        overflowsBottom: box.bottom > window.innerHeight,
        tallerThanCap: box.height > 210,
        firstRowVisible: first !== undefined && first.top >= 0 && first.bottom <= window.innerHeight,
      }
    })
    expect(fit).toEqual({
      side: 'bottom',
      overflowsTop: false,
      overflowsBottom: false,
      tallerThanCap: false,
      firstRowVisible: true,
    })
  }, 60_000)
  it('an open conversation keeps the control reachable in the composer', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-machine-control-session'))
    const search = page.getByRole('button', { name: 'Search sessions' })
    if (await search.getAttribute('aria-expanded') !== 'true') await search.click()
    await page.getByPlaceholder('Search sessions', { exact: false }).fill('WATERFALL')
    const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
    await expect.poll(() => result.count(), { timeout: 20_000 }).toBe(1)
    await result.click()
    await viewToggle(page).waitFor({ timeout: 20_000 })

    // Still exactly one, and the hero row is gone, so it must be the card's.
    await expect.poll(() => controls(page).count(), { timeout: 20_000 }).toBe(1)
    const placement = await controls(page).first().evaluate(el => ({
      heroRow: el.closest('[class*="heroWorkspaceRow"]') !== null,
      composer: el.closest('[class*="composer"], [data-composer-seat]') !== null,
    }))
    expect(placement).toEqual({ heroRow: false, composer: true })
  }, 60_000)

})
