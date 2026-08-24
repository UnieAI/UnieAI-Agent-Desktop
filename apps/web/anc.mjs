import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: 'dark' })
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2800)
// Dismiss the API-key onboarding so the composer is reachable.
const later = page.getByRole('button', { name: /Configure later/i }).first()
if (await later.count() > 0) { await later.click().catch(() => {}); await page.waitForTimeout(1200) }
const trigger = page.getByRole('button', { name: /Workspace Write/i }).first()
if (await trigger.count() === 0) { console.log(JSON.stringify({ error: 'trigger missing' })); await browser.close(); process.exit(0) }
await trigger.click(); await page.waitForTimeout(900)
await page.screenshot({ path: process.argv[2] + '/40-composer-menu.png' })
const info = await page.evaluate(() => {
  const chain = (el) => { const out = []; let n = el
    while (n && out.length < 9) { const c = getComputedStyle(n), r = n.getBoundingClientRect()
      out.push({ tag: n.tagName, cls: (n.className?.toString() ?? '').slice(0, 40),
                 z: c.zIndex, pos: c.position, ov: c.overflow, y: Math.round(r.y), h: Math.round(r.height) })
      n = n.parentElement }
    return out }
  const menu = document.querySelector('[role="menu"], [class*="menuRoot"], [class*="popup"]')
  const card = document.querySelector('[class*="_card"]')
  return { menu: menu ? chain(menu) : null, card: card ? chain(card).slice(0, 5) : null }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
