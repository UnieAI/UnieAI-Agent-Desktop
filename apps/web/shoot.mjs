import { chromium } from 'playwright'
const out = process.argv[2], scheme = process.argv[3] ?? 'light'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: scheme })
const log = []
page.on('pageerror', e => log.push(`pageerror: ${e.message}`))
const click = async (name, ms = 1400) => {
  const el = page.getByRole('button', { name }).first()
  if (await el.count() === 0) { log.push(`missing: ${String(name)}`); return false }
  await el.click({ timeout: 6000 }).catch(e => log.push(`click ${String(name)}: ${e.message.slice(0, 50)}`))
  await page.waitForTimeout(ms); return true
}
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await click(/Continue/i)
await click(/Choose workspace/i, 1500)
await click(/^Open$/i, 2500)
await click(/Configure later|稍後設定/i, 2000)
await click(/Open the details panel|打開詳情面板|打开详情面板/i, 1800)
await page.screenshot({ path: `${out}/20-panel-${scheme}.png` })
// Open the `+` menu.
const plus = page.getByRole('button', { name: /Open…|打開…|打开…|panel\.open/i }).first()
if (await plus.count() > 0) { await plus.click().catch(e => log.push(`plus: ${e.message.slice(0,50)}`)); await page.waitForTimeout(900) }
else log.push('plus button not found')
await page.screenshot({ path: `${out}/21-menu-${scheme}.png` })
const items = await page.locator('[role="menuitem"]').evaluateAll(els => els.map(e => ({
  text: (e.textContent ?? '').trim(),
  box: e.getBoundingClientRect ? { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) } : null,
})))
console.log(JSON.stringify({ items, log }, null, 1))
await browser.close()
