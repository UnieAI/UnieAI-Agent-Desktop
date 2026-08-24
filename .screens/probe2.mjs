import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const info = await p.evaluate(()=>{
  const main = document.querySelector('main') || document.body;
  const dd = document.querySelector('[data-details-collapsed]');
  return {
    url: location.href,
    main: (main.innerText||'').slice(0,400),
    detailsParent: dd ? dd.parentElement?.outerHTML.slice(0,200) : null,
  };
});
console.log(JSON.stringify(info,null,1));
await b.close();
