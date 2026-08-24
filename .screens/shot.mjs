import { chromium } from 'playwright'
import fs from 'node:fs'
fs.mkdirSync('/home/ubuntu/service/UnieAI-Agent-Desktop/.screens', { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE_ERROR:', m.text()) })
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'load', timeout: 30000 })
await new Promise(r => setTimeout(r, 3000))
await page.screenshot({ path: '/home/ubuntu/service/UnieAI-Agent-Desktop/.screens/full.png' })
await browser.close()
console.log('done')