import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 700 }, colorScheme: 'dark' })
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2800)
const later = page.getByRole('button', { name: /Configure later/i }).first()
if (await later.count() > 0) { await later.click().catch(()=>{}); await page.waitForTimeout(1200) }
await page.screenshot({ path: process.argv[2] + '/60-now.png' })
const m = await page.evaluate(() => {
  const g = (sel) => { const e = document.querySelector(sel); if (!e) return null
    const r = e.getBoundingClientRect(), c = getComputedStyle(e)
    return { x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y), h: Math.round(r.height), z: c.zIndex, bg: c.backgroundColor } }
  return { row: g('[class*=heroWorkspaceRow]'), card: g('[class*=_card]') }
})
console.log(JSON.stringify(m, null, 1))
await browser.close()
