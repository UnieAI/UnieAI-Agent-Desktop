import { chromium } from 'playwright'
const scheme = process.argv[3] ?? 'dark'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: scheme })
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: `${process.argv[2]}/30-hero-${scheme}.png` })
// The workspace chip in the hero row.
const chip = page.locator('button').filter({ hasText: /ubuntu/ }).first()
if (await chip.count() > 0) { await chip.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(1200) }
await page.screenshot({ path: `${process.argv[2]}/31-chipmenu-${scheme}.png` })
// Report the stacking of card / row / any open menu.
const z = await page.evaluate(() => {
  const pick = (re) => [...document.querySelectorAll('div,button,ul')]
    .filter(e => re.test(e.className?.toString() ?? ''))
    .map(e => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
      return { cls: e.className.toString().slice(0,46), z: c.zIndex, pos: c.position,
               y: Math.round(r.y), h: Math.round(r.height), bg: c.backgroundColor } })
  return { card: pick(/card/), row: pick(/heroWorkspaceRow|workspaceRow/), menu: pick(/menu|Menu|popup|Popup/).slice(0,4) }
})
console.log(JSON.stringify(z, null, 1))
await browser.close()
