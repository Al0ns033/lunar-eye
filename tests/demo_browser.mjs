// Optional end-to-end check: requires Playwright and an app already running.
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const artifactDir = await fs.mkdtemp(path.join(tmpdir(), 'lmp-demo-'));
const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];const results=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
try {
await page.goto((process.env.LMP_URL || 'http://127.0.0.1:8765') + '/#solar');
await page.waitForSelector('#ss-info h3');
await page.waitForSelector('#loading.done',{state:'attached',timeout:20000});
await page.locator('.timebar [data-language="en"]').click();
// Dismiss/reopen Explorer panels without losing drafts or checkbox state.
await page.locator('nav button[data-page="explorer"]').click();
await page.waitForSelector('#ex-point .kv');
await page.fill('#ex-name', 'Sito personale');
await page.locator('[data-close-panel="site"]').click();
if (await page.locator('#ex-site-panel').isVisible()) throw new Error('Site panel did not close');
await page.keyboard.press('Space'); // close returns focus to its reopening control
if (await page.locator('#ex-name').inputValue() !== 'Sito personale') throw new Error('Panel toggle lost draft');
await page.locator('#ex-grid').uncheck();
await page.locator('[data-close-panel="view"]').click();
await page.locator('[data-ex-panel="view"]').click();
if (await page.locator('#ex-grid').isChecked()) throw new Error('Panel toggle reset checkbox');
await page.locator('[data-ex-panel="site"]').click();
await page.reload();
await page.waitForSelector('#ex-point .kv', { state: 'attached' });
await page.waitForSelector('#loading.done', { state: 'attached' });
if (await page.locator('#ex-site-panel').isVisible()) throw new Error('Panel preference did not persist');
await page.locator('[data-ex-panel="site"]').click();
await page.locator('nav button[data-page="planning"]').click();
await page.selectOption('#pl-site','1');
await page.fill('#pl-name','Lunar Demo');
await page.fill('#pl-start','2026-12-01T00:00');
await page.fill('#pl-days','14');
await page.click('#pl-run');
await page.waitForFunction(async () => Boolean((await import('/js/state.js')).state.analysis), undefined, {timeout:45000});
await page.waitForSelector('#pl-msg .badge');
const before = await page.evaluate(async () => { const {state} = await import('/js/state.js'); return { analysis: JSON.stringify(state.analysis), time: state.timeMs }; });
await page.fill('#pl-name','Missione personale');
await page.fill('#pl-days','17');
let siteRequests=0;page.on('request',r=>{if(r.url().includes('/api/site?'))siteRequests++;});
for (const lang of ['it','en']) {
 await page.locator(`.timebar [data-language="${lang}"]`).click();
 const after=await page.evaluate(async () => {const {state}=await import('/js/state.js');return {analysis:JSON.stringify(state.analysis),time:state.timeMs,name:document.querySelector('#pl-name').value,days:document.querySelector('#pl-days').value};});
 if(after.analysis!==before.analysis || after.time!==before.time || after.name!=='Missione personale' || after.days!=='17') throw new Error('Language change lost state '+JSON.stringify({analysis:after.analysis===before.analysis,timeBefore:before.time,timeAfter:after.time,name:after.name,days:after.days}));
}
if(siteRequests!==0)throw new Error('Language change repeated a scientific request');
await page.screenshot({path:path.join(artifactDir, 'lmp-planning-en.png')});
await page.locator('nav button[data-page="analysis"]').click();
results.push({lang:'en',page:'analysis-results',text:await page.locator('.page.active').innerText()});
const downloadEvent=page.waitForEvent('download');await page.click('#an-csv');const download=await downloadEvent;await download.saveAs(path.join(artifactDir, 'lmp-demo.csv'));
await page.emulateMedia({media:'print'});await page.pdf({path:path.join(artifactDir, 'lmp-demo-en.pdf'),printBackground:true});await page.emulateMedia({media:'screen'});
await page.screenshot({path:path.join(artifactDir, 'lmp-analysis-en.png')});
await page.locator('.timebar [data-language="it"]').click();
results.push({lang:'it',page:'analysis-results',text:await page.locator('.page.active').innerText()});
await page.locator('nav button[data-page="compare"]').click();
await page.locator('#cmp-sites input[value="0"]').uncheck();
await page.click('#cmp-run');
await page.waitForSelector('#cmp-out tbody tr',{timeout:45000});
results.push({lang:'it',page:'compare-results',text:await page.locator('#cmp-out').innerText()});
const selectedBefore=await page.locator('#cmp-sites input:checked').evaluateAll(es=>es.map(e=>e.value));
await page.locator('.timebar [data-language="en"]').click();
results.push({lang:'en',page:'compare-results',text:await page.locator('#cmp-out').innerText()});
const selectedAfter=await page.locator('#cmp-sites input:checked').evaluateAll(es=>es.map(e=>e.value));
if(JSON.stringify(selectedBefore)!==JSON.stringify(selectedAfter))throw new Error('Comparison selection changed');
const chartLabels=await page.evaluate(async()=>{const {default:Chart}=await import('chart.js/auto');return Chart.getChart(document.querySelector('#cmp-bar')).data.labels;});
if(chartLabels[0]!=='Sun visible %')throw new Error('Chart labels not translated');
await page.screenshot({path:path.join(artifactDir, 'lmp-desktop.png')});
await page.setViewportSize({width:390,height:844});
await page.locator('nav button[data-page="education"]').click();
await page.screenshot({path:path.join(artifactDir, 'lmp-mobile.png')});
await page.reload();await page.waitForSelector('#edu-topics');
if(await page.locator('html').getAttribute('lang')!=='en')throw new Error('Language did not persist');
results.push({preservation:'analysis, time, draft fields, comparison choices',languageOnlySiteRequests:0,chartLabels,csv:download.suggestedFilename(),persistence:'en after reload'});
if (errors.length) throw new Error(errors.join('; '));
results.push({errors,languageVisible:await page.locator('#language').isVisible()});
await fs.writeFile(path.join(artifactDir, 'lmp-demo-check.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({checks:results.length,errors,report:path.join(artifactDir, 'lmp-demo-check.json')}));
} catch(e) { console.log('FAIL',e.message,(await page.locator('body').innerText()).slice(-4000)); await page.screenshot({path:path.join(artifactDir, 'lmp-failure.png')});process.exitCode=1; }
finally { await browser.close(); }
