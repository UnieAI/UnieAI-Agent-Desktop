import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR:'+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE:'+m.text())});
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.getByText('侧边栏文件区显示问题', { exact: true }).last().click();
await p.waitForTimeout(3500);
const res1 = await p.evaluate(()=>({
  collapsed: document.querySelector('[data-details-collapsed]')?.getAttribute('data-details-collapsed'),
  toggle: document.querySelectorAll('button[aria-label="Open the details panel"]').length,
  main: (document.querySelector('main')?.innerText||'').slice(0,300),
}));
console.log('after clicking session:', JSON.stringify(res1));
// click toggle
await p.locator('button[aria-label="Open the details panel"]').first().click();
await p.waitForTimeout(800);
const res2 = await p.evaluate(()=>({
  collapsed: document.querySelector('[data-details-collapsed]')?.getAttribute('data-details-collapsed'),
}));
console.log('after details toggle:', JSON.stringify(res2));
// click Files tab
await p.getByRole('button', { name: /^Files$/i }).first().click();
await p.waitForTimeout(1200);
const res3 = await p.evaluate(()=>{
  const el = document.querySelector('[data-details-collapsed]');
  return { text: (el?el.innerText:''), filesText: (document.querySelector('.sD0JZq_frame')?.parentElement?'' :'') };
});
console.log('Files tab text:', JSON.stringify(res3.text).slice(0,600));
console.log('errors:', JSON.stringify(errs));
await b.close();
