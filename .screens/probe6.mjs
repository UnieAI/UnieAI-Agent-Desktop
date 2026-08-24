import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto('http://127.0.0.1:3080', { waitUntil: 'load' });
await p.waitForTimeout(2500);
await p.getByText('侧边栏文件区显示问题', { exact: true }).last().click();
await p.waitForTimeout(4000);
await p.locator('button[aria-label="Open the details panel"]').first().click();
await p.waitForTimeout(600);
// click Files tab
const filesBtn = p.getByRole('button', { name: 'Files' });
console.log('files tab present:', await filesBtn.count());
await filesBtn.first().click();
await p.waitForTimeout(1200);
const out = await p.evaluate(()=>{
  const frame = document.querySelector('[style*="grid-template-columns"]');
  const text = frame ? frame.innerText : '';
  // find something resembling file rows
  return { text: text.slice(0,400), nsrows: [...document.querySelectorAll('[role="treeitem"]')].length };
});
console.log('after Files tab:', JSON.stringify(out));
await b.close();
