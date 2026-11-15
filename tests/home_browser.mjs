// Home must stay usable without API/CDN/texture/3D loads until explicit entry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const url=process.env.LMP_URL || 'http://127.0.0.1:8765';
const dir=await fs.mkdtemp(path.join(tmpdir(),'lmp-home-'));
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>requests.push(r.url()));
try {
 await page.goto(url);
 await page.locator('#home-title').waitFor();
 await page.locator('#home [data-language="it"]').click();
 assert.match(await page.locator('#home-title').textContent(),/Esplora la Luna/);
 await page.locator('.home-guide-link').click();
 await page.waitForSelector('#home-guide details[open]');
 await page.locator('#home [data-language="en"]').click();
 assert.match(await page.locator('#home-guide summary').textContent(),/first walkthrough/);
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(100);
  await page.screenshot({path:path.join(dir,`home-${width}.png`),fullPage:true});
 }
 assert.equal(await page.locator('canvas').count(),0);
 const heavy=requests.filter(u=>/\/api\/|\/render\/|\/main.js|three@|chart.js@|\/textures\//.test(u));
 assert.deepEqual(heavy,[],'Home starts heavy work');
 assert.equal(await page.locator('#loading').isVisible(),false);
 // Planning entry keeps loader, does not calculate science without user action.
 await page.locator('.home-actions a[href="#planning"]').click();
 await page.waitForSelector('#pl-run');
 await page.waitForSelector('#loading.done',{state:'attached'});
 assert.equal(await page.locator('#home').isVisible(),false);
 assert.equal(await page.locator('#t-play').isDisabled(),true);
 assert.equal(requests.some(u=>u.includes('/api/site?')),false);
 assert.equal(await page.locator('.ld-orbit').count(),1);
 // Returning home is a full reload: no old renderer/RAF stays in the background.
 await page.locator('.app-home-link').click();
 await page.waitForSelector('#home-title');
 assert.equal(await page.locator('canvas').count(),0);
 await page.goto(url+'/#explorer');
 await page.waitForSelector('#ex-view canvas');
 await page.waitForSelector('#loading.done',{state:'attached'});
 assert.equal(await page.locator('#home').isVisible(),false);
 await page.goBack();
 await page.waitForSelector('#home-title');
 assert.equal(await page.locator('canvas').count(),0);
 assert.deepEqual(errors,[]);
 const report={dir,errors,homeHeavyRequests:heavy.length,widths:[1440,390],planningWithoutCalculation:true,directExplorer:true};
 await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
} finally {await browser.close();}
