// UI regression: local app required; real planning uses Horizons cache when available.
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const dir = await fs.mkdtemp(path.join(tmpdir(),'lmp-panels-'));
const errors=[], results=[];
page.on('pageerror',e=>errors.push(e.message));
let science=0;
page.on('request',r=>{if(r.url().includes('/api/site?'))science++;});
try {
  await page.goto((process.env.LMP_URL || 'http://127.0.0.1:8765') + '/#solar');
  await page.waitForSelector('#ss-info h3');
  await page.waitForSelector('#loading.done',{state:'attached'});
  await page.locator('#sidebar-toggle').click();
  if(await page.locator('#sidebar-toggle').getAttribute('aria-expanded')!=='false')throw Error('Sidebar did not collapse');
  await page.reload();
  await page.waitForSelector('#ss-info h3');
  if(await page.locator('#sidebar-toggle').getAttribute('aria-expanded')!=='false')throw Error('Sidebar preference lost');
  for (const name of ['solar','planning','compare','analysis','education']) {
    await page.locator(`nav [data-page="${name}"]`).click();
    const root=page.locator(`#page-${name}`);
    await root.locator('.managed-close').first().waitFor();
    const panel=root.locator('.managed-panel').first();
    const id=await panel.getAttribute('id');
    if(name==='planning')await page.fill('#pl-name','Draft survives');
    const before=science;
    await panel.locator(':scope > .managed-close').click();
    if(await panel.isVisible())throw Error(`${name}: panel not hidden`);
    await root.locator(`button[aria-controls="${id}"]`).click();
    if(!await panel.isVisible())throw Error(`${name}: panel not restored`);
    if(science!==before)throw Error(`${name}: toggle recalculated science`);
    if(name==='planning' && await page.inputValue('#pl-name')!=='Draft survives')throw Error('Draft lost');
    await root.locator('.panel-menu summary').click();
    results.push({page:name,panels:await root.locator('.managed-panel').count()});
  }
  await page.locator('nav [data-page="planning"]').click();
  await page.selectOption('#pl-site','1');
  await page.fill('#pl-start','2026-12-01T00:00');
  await page.fill('#pl-days','14');
  await page.click('#pl-run');
  await page.waitForFunction(async()=>Boolean((await import('/js/state.js')).state.analysis),null,{timeout:120000});
  await page.waitForSelector('#pl-hud .mission-instrument');
  const count=science;
  const event=page.locator('#pl-events button').first();
  if(await event.count())await event.click();
  await page.locator('.timebar [data-language="it"]').click();
  await page.locator('.timebar [data-language="en"]').click();
  if(science!==count)throw Error('Timeline/language recalculated science');
  await page.screenshot({path:path.join(dir,'planning-calculated.png')});
  // Persist a closed form, then restore from keyboard after reload.
  const form=page.locator('#page-planning .form');
  await form.locator(':scope > .managed-close').click();
  await page.reload();
  await page.waitForSelector('#pl-sky');
  await page.waitForSelector('#loading.done',{state:'attached'});
  await page.waitForSelector('#page-planning .panel-menu');
  if(await page.locator('#page-planning .form').isVisible())throw Error('Panel preference lost');
  await page.locator('#page-planning .panel-menu summary').focus();await page.keyboard.press('Enter');
  const formId=await page.locator('#page-planning .form').getAttribute('id');
  const trigger=page.locator(`#page-planning button[aria-controls="${formId}"]`);
  await trigger.focus();await page.keyboard.press('Enter');
  if(!await page.locator('#page-planning .form').isVisible())throw Error('Keyboard restore failed');
  await page.locator('#page-planning .panel-menu summary').click();
  for(const width of [1440,1100,390]) {
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:path.join(dir,`planning-${width}.png`)});
    results.push({width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({dir,errors,results}));
} finally {await fs.writeFile(path.join(dir,'report.json'),JSON.stringify({errors,results},null,2));await browser.close();}
