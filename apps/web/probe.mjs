import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' })
await page.goto('http://127.0.0.1:3082/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
// The band sits just below the composer card; sample a point inside it.
const info = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('button')].find(b => /ubuntu/.test(b.textContent ?? ''))
  if (!chip) return { error: 'chip not found' }
  const chain = []
  let el = chip
  for (let i = 0; i < 6 && el; i++) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    chain.push({
      tag: el.tagName, cls: el.className?.toString().slice(0, 70),
      bg: cs.backgroundColor, z: cs.zIndex, pos: cs.position,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    })
    el = el.parentElement
  }
  const card = document.querySelector('[class*="card"]')
  const cr = card?.getBoundingClientRect()
  return { chain, card: cr ? { y: Math.round(cr.y), h: Math.round(cr.height) } : null }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
