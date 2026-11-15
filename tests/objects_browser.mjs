const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto((process.env.LMP_URL || 'http://127.0.0.1:8765') + '/#solar');
 await page.waitForSelector('#ss-info h3');
 await page.evaluate(async()=>{const {state,setTime}=await import('/js/state.js');state.playing=false;setTime(Date.parse('2026-12-01T00:00Z')); const {SolarScene}=await import('/js/render/solarScene.js');const f=SolarScene.prototype.render;window.draws=0;SolarScene.prototype.render=function(){window.draws++;window.sceneStats={drawCount:this.drawCount,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio(),visible:Object.entries(this.objs).filter(([,o])=>o.group.visible).map(([k])=>k)};return f.call(this);};});
 await page.waitForFunction(async()=>Boolean((await import('/js/state.js')).ephem.get('earth',2461375.5)),{timeout:60000});
 const checks=page.locator('#ss-extra input');
 if(await checks.count()!==5)throw Error('Missing objects');
 for(let i=0;i<5;i++)await checks.nth(i).check();
 await page.waitForFunction(()=>['ceres','vesta','halley','voyager1','jwst'].every(k=>window.sceneStats?.visible.includes(k)),{timeout:60000});
 await page.locator('[data-visible="mars"]').uncheck();
 await page.waitForFunction(()=>!window.sceneStats.visible.includes('mars'));
 for(let i=0;i<5;i++)await checks.nth(i).uncheck();
 await page.waitForFunction(()=>!window.sceneStats.visible.includes('ceres'));
 const start=await page.evaluate(()=>({draws:window.draws,rendered:window.sceneStats.drawCount,time:performance.now()}));
 await page.waitForTimeout(3000);
 const result=await page.evaluate(s=>({frameCallbacksPerSecond:(window.draws-s.draws)*1000/(performance.now()-s.time),actualDraws:window.sceneStats.drawCount-s.rendered,...window.sceneStats}),start);
 await page.screenshot({path:'/tmp/lmp-objects.png'});
 await fs.writeFile('/tmp/lmp-objects-report.json',JSON.stringify({errors,result},null,2));
 console.log(JSON.stringify({errors,result}));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
