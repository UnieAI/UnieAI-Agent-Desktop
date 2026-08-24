import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')].map((el,i)=>({
    i, aria: el.getAttribute('aria-label'), title: el.getAttribute('title'),
    txt: (el.innerText||'').trim().slice(0,30), visible: !!(el.offsetWidth||el.offsetHeight)
  }));
  return { frame: (document.querySelector('[data-details-collapsed]')||{}).getAttribute?.('data-details-collapsed'), buttons: buttons.filter(b=>b.txt||b.aria||b.title) };
});
console.log(JSON.stringify(info,null,0));
await b.close();
