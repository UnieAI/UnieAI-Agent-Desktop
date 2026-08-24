import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: '+e.message));
p.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);

const before = await p.evaluate(()=>document.querySelector('[data-details-collapsed]')?.getAttribute('data-details-collapsed'));
console.log('collapsed before open:', before);

// find and click the header details toggle
const hasToggle = await p.locator('button[aria-label="Open the details panel"]').count();
console.log('details toggle count:', hasToggle);
if (hasToggle) {
  await p.locator('button[aria-label="Open the details panel"]').first().click();
  await p.waitForTimeout(800);
  const after = await p.evaluate(()=>document.querySelector('[data-details-collapsed]')?.getAttribute('data-details-collapsed'));
  console.log('collapsed after open:', after);
  // click Files tab
  const files = await p.getByRole('button', { name: /Files/i }).count();
  console.log('files tab count:', files);
  if (files) {
    await p.getByRole('button', { name: /Files/i }).first().click();
    await p.waitForTimeout(800);
    const filesArea = await p.evaluate(()=>{
      const el = document.querySelector('[data-details-collapsed]');
      const text = el ? el.innerText : '';
      return { len: text.length, snippet: text.slice(0,300) };
    });
    console.log('files panel text len:', filesArea.len);
    console.log('files panel snippet:', filesArea.snippet);
  }
}
console.log('errors:', JSON.stringify(errs));
await b.close();
