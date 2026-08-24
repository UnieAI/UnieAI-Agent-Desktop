import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'load', timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))
// Find the "Files" button and dump its ancestry and sibling region
const fileBtn = page.locator('button', { hasText: 'Files' }).first()
console.log('Files btn exists:', await fileBtn.count())
if (await fileBtn.count()) {
  const info = await fileBtn.evaluate(el => {
    let node = el
    const chain = []
    for (let i=0;i<6 && node;i++){ chain.push({tag: node.tagName, cls: typeof node.className==='string'?node.className:'', role: node.getAttribute('role')}); node = node.parentElement }
    return chain
  })
  console.log('ancestry:', JSON.stringify(info, null, 1))
  // Find closest panel container and dump text
  const panel = await fileBtn.evaluate(el => {
    let p = el.closest('[data-panel]') || el.closest('[class*="panel"]') || el.closest('[role="tabpanel"]')
    return p ? {tag:p.tagName, cls: p.className, text: p.textContent.slice(0,1500)} : null
  })
  console.log('panel:', JSON.stringify(panel, null,1))
}
// produced btn
const prodBtn = page.locator('button', { hasText: '^Produced$' })
console.log('produced count:', await prodBtn.count())
await browser.close()
console.log('done')