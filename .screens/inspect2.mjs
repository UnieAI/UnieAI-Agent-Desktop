import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
page.on('console', m => { if (m.type()==='error'||m.type()==='warning') console.log('CONSOLE_'+m.type().toUpperCase()+':', m.text()) })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'load', timeout: 30000 })
await new Promise(r => setTimeout(r, 3000))
// nav buttons in sidebar
console.log('=== all buttons with text ===')
const btns = await page.locator('button').allTextContents()
btns.forEach((b,i)=>{ if(b.trim()) console.log(i, JSON.stringify(b.trim())) })
// section headings h1-h4
console.log('=== headings ===')
const heads = await page.locator('h1,h2,h3,h4').allTextContents()
heads.forEach((h,i)=>console.log(i, JSON.stringify(h.trim())))
// tab list
console.log('=== role tablist/tab ===')
const tabs = await page.locator('[role="tab"]').allTextContents()
tabs.forEach(t=>console.log(JSON.stringify(t)))
await browser.close()
console.log('done')