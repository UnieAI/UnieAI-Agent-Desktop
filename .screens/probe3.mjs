import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const sess = p.getByText('侧边栏文件区显示问题', { exact: true }).last();
console.log('session node count:', await sess.count());
if (await sess.count()) { await sess.click(); await p.waitForTimeout(1500); }
const res = await p.evaluate(()=>({
  url: location.href,
  main: (document.querySelector('main')?.innerText||'').slice(0,500),
  toggleCount: document.querySelectorAll('button[aria-label="Open the details panel"]').length,
}));
console.log(JSON.stringify(res,null,1));
await b.close();
