import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE_ERROR:', m.text()) })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'load', timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))

// Is details column rendered & open?
const frame = await page.locator('[data-details-collapsed]').first().getAttribute('data-details-collapsed')
console.log('data-details-collapsed attr on frame (first matching):', frame)
const ddDetails = await page.locator('.sD0JZq_detailsCol, [class*="detailsCol"]').count()
console.log('detailsCol count:', ddDetails)

// Try opening the Files tab. First, list any role=tab in details.
console.log('=== role=tab before ===')
const tabs = await page.locator('[role="tab"]').allTextContents()
tabs.forEach(t=>console.log(JSON.stringify(t)))

// Click the + (plus) to open the menu, then Files.  The plus has aria-label = panel.open (or "+")
const plus = page.locator('button[aria-label*="+"]').first()
console.log('plus count:', await plus.count())
if (await plus.count()) { await plus.click(); await new Promise(r=>setTimeout(r,300)) }

// Now the menu appears with Files / Produced items (role=menuitem)
console.log('menuitems:')
const items = await page.locator('[role="menuitem"]').allTextContents()
items.forEach(it=>console.log(JSON.stringify(it)))
const filesItem = page.locator('[role="menuitem"]', { hasText: /Files|檔案|文件/i }).first()
if (await filesItem.count()) { await filesItem.click(); await new Promise(r=>setTimeout(r,1500)) }

console.log('=== after opening Files ===')
await page.screenshot({ path: '/home/ubuntu/service/UnieAI-Agent-Desktop/.screens/files.png' })
// dump tree content
const tree = await page.locator('table, [role="tree"], treeitem').allTextContents()
tree.forEach((t,i)=>console.log('treeitem'+i+':', JSON.stringify(t.slice(0,200))))
// Also try the workspace dir tree
const treeAside = await page.locator('aside').allTextContents()
treeAside.forEach((t,i)=>console.log('aside'+i+':', JSON.stringify(t.slice(0,300))))
const bodyText = await page.textContent('body')
console.log('body tail:', JSON.stringify(bodyText.slice(-600)))
await browser.close()
console.log('done')