import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, colorScheme: 'dark' })
const log = []
page.on('pageerror', e => log.push(`pageerror: ${e.message.slice(0,140)}`))
page.on('console', m => { if (m.type() === 'error') log.push(`console: ${m.text().slice(0,140)}`) })
page.on('response', r => { if (r.url().includes('/api/')) log.push(`http ${r.status()} ${r.url().split('/api/')[1]?.slice(0,60)}`) })
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2800)
const later = page.getByRole('button', { name: /Configure later/i }).first()
if (await later.count() > 0) { await later.click().catch(()=>{}); await page.waitForTimeout(1200) }
// Send a message so the session leaves blank and the header (with the details opener) renders.
const box = page.locator('textarea').first()
if (await box.count() > 0) { await box.click().catch(()=>{}); await page.keyboard.type('hi'); await page.waitForTimeout(600) }
await page.screenshot({ path: `${out}/50-before.png` })
const opener = page.getByRole('button', { name: /Open the details panel|打開詳情面板|打开详情面板/i }).first()
log.push(`opener count=${await opener.count()}`)
if (await opener.count() > 0) { await opener.click().catch(()=>{}); await page.waitForTimeout(1500) }
await page.screenshot({ path: `${out}/51-panel.png` })
const files = page.getByRole('menuitem').filter({ hasText: /Files|檔案|文件/ }).first()
log.push(`files item count=${await files.count()}`)
if (await files.count() > 0) { await files.click().catch(()=>{}); await page.waitForTimeout(2500) }
await page.screenshot({ path: `${out}/52-files.png` })
console.log(JSON.stringify({ log: log.slice(-18) }, null, 1))
await browser.close()
