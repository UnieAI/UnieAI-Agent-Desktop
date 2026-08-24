import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE_ERROR:', m.text()) })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'load', timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))

// find the details toggle: a button whose aria-label or title is the details.open string.
// We don't know the locale string; find buttons and print aria-labels containing 'details' OR svg with the panel rect
const all = await page.locator('button').evaluateAll(btns => btns.map(b => ({al: b.getAttribute('aria-label'), t: b.getAttribute('title'), txt: (b.textContent||'').trim()})))
console.log('button labels:')
all.forEach((b,i)=>console.log(i, JSON.stringify(b)))

// Click the details toggle - it's the one with svg path M10.25 2.75v10.5. Use hover-based guess: find by class containing DetailsToggle
const toggle = page.locator('button[class*="oggle"]').filter({ has: page.locator('svg') })
console.log('toggle candidates:', await toggle.count())
if (await toggle.count()) {
  for (let i=0;i<await toggle.count();i++){
    const lbl = await toggle.nth(i).getAttribute('aria-label')
    console.log('cand', i, lbl, await toggle.nth(i).isVisible())
  }
}
await browser.close()