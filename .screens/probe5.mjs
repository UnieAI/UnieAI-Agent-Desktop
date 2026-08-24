import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.getByText('侧边栏文件区显示问题', { exact: true }).last().click();
await p.waitForTimeout(4000);
console.log('main:', JSON.stringify((await p.evaluate(()=>document.querySelector('main')?.innerText||'')).slice(0,400)));
console.log('collapsed:', await p.evaluate(()=>document.querySelector('[data-details-collapsed]')?.getAttribute('data-details-collapsed')) , 'toggles:', await p.locator('button[aria-label="Open the details panel"]').count());
await p.locator('button[aria-label="Open the details panel"]').first().click();
await p.waitForTimeout(600);
// now dump buttons to find Files area
const btns = await p.evaluate(()=>[...document.querySelectorAll('button')].map((b,i)=>({i,aria:b.getAttribute('aria-label'),title:b.getAttribute('title'),txt:(b.innerText||'').trim().slice(0,20)})).filter(x=>x.txt||x.aria||x.title));
console.log('buttons:', JSON.stringify(btns));
console.log('details text:', JSON.stringify((await p.evaluate(()=>document.querySelector('.sD0JZq_frame')?.innerText||'')).slice(0,400)));
await b.close();
