import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const base=process.env.SHOWCASE_URL||'http://127.0.0.1:4175/';
const server=process.env.SHOWCASE_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4175','--strictPort'],{stdio:'pipe',windowsHide:true});
const data=JSON.parse(await readFile('public/data/journey/manifest.json','utf8'));
const errors=[];let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
 await mkdir('.qa/journey',{recursive:true});
 for(const width of [1366,768,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.locator('.chapter-grid').waitFor();
  assert.equal(await page.locator('.chapter-link').count(),6);
  await page.screenshot({path:'.qa/journey/'+width+'-home.png',fullPage:true});
  for(let id=1;id<=40;id++){
   await page.evaluate(n=>location.hash='#/step/'+String(n).padStart(2,'0'),id);
   await page.waitForFunction(n=>document.querySelector('main')?.getAttribute('data-step')===String(n)&&document.querySelector('.lesson-content'),id);
   await page.locator('.lesson-content').waitFor();
   const content=await page.locator('.lesson-content').innerText();
   assert.ok(content.length>30,'empty page '+id);assert.doesNotMatch(content,/NaN|undefined|Infinity/);
   const dims=await page.evaluate(()=>({width:document.documentElement.scrollWidth,invalid:[...document.querySelectorAll('svg path')].some(p=>/NaN|Infinity/.test(p.getAttribute('d')||''))}));
   assert.ok(dims.width<=width,'overflow '+id+' at '+width+': '+dims.width);assert.equal(dims.invalid,false);
   if([1,5,9,20,29,33,38,39].includes(id))await page.screenshot({path:'.qa/journey/'+width+'-'+id+'.png',fullPage:true});
  }
  await page.close();console.log('[PASS] 40 pages and home at '+width+'px');
 }
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 const go=async id=>{await page.goto(base+'#/step/'+String(id).padStart(2,'0'));await page.locator('.lesson-content').waitFor();};
 await go(38);
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'单步',exact:true}).click();
 assert.equal(await page.getByTestId('demo-outcome').count(),1);
 await page.getByRole('slider',{name:'演示时刻'}).fill('63');
 assert.equal(await page.getByRole('button',{name:'单步',exact:true}).isDisabled(),true);
 assert.match(await page.locator('.range-row output').innerText(),/64/);
 await page.getByRole('button',{name:'重新开始演示'}).click();
 assert.equal(await page.getByTestId('demo-outcome').count(),0);
 await page.getByRole('button',{name:'播放演示',exact:true}).click();
 await page.getByRole('button',{name:'暂停演示',exact:true}).click();
 const before=await page.locator('.process .selected').innerText();
 await page.waitForTimeout(1500);assert.equal(await page.locator('.process .selected').innerText(),before);
 for(const model of data.models){
  await page.getByRole('radio',{name:model.name,exact:true}).click();
  await page.waitForFunction(name=>document.querySelector('.demo-origin')?.textContent?.includes(name),model.name);
  await page.getByRole('button',{name:/异常分数.*125测点/}).click();
  assert.equal(await page.getByTestId('computed-score').innerText(),model.scores[175].toFixed(6));
 }
 await page.screenshot({path:'.qa/journey/demo-score.png',fullPage:true});
 await go(38);
 await page.getByRole('button',{name:/判定结果.*比较阈值/}).click();
 await page.getByRole('slider',{name:'演示时刻'}).fill('61');
 await page.getByRole('combobox',{name:'播放速度'}).selectOption('4');
 await page.getByRole('button',{name:'播放演示',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.range-row output')?.textContent==='64 / 64');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='播放演示'&&b.disabled));
 await go(40);
 await page.getByRole('combobox',{name:'筛选检测结果'}).selectOption('误报');
 assert.ok((await page.locator('.results-table tbody tr').allTextContents()).every(t=>t.includes('误报')));
 await go(20);
 await page.getByText('查看完整研究架构图',{exact:true}).click();
 await page.locator('.research-figure').evaluate(img=>img.decode());
 await go(14);
 const curve=await page.locator('.chart-svg path[stroke]').last().getAttribute('d');
 await page.getByRole('slider',{name:'异常构造参数'}).fill('20');
 assert.notEqual(await page.locator('.chart-svg path[stroke]').last().getAttribute('d'),curve);
 await go(36);await page.getByRole('radio',{name:'区间点调整'}).click();
 assert.match(await page.locator('.comparison-table').innerText(),/89.87%/);
 await go(39);assert.equal(await page.getByRole('radio',{name:'区间点调整'}).count(),0);
 await go(37);await page.getByRole('button',{name:'末段片段'}).click();
 await page.getByRole('button',{name:'查看检测过程'}).click();
 await page.locator('.detection-demo').waitFor();
 assert.match(await page.locator('.chart-svg').textContent(),/2397/);
 await page.getByRole('button',{name:'目录',exact:true}).click();
 assert.equal(await page.getByRole('dialog').locator('.all-steps a').count(),40);
 await page.keyboard.press('Escape');
 await page.locator('.brand').click();await page.getByRole('button',{name:'继续第 38 步'}).click();
 await page.locator('.detection-demo').waitFor();
 await page.goto(base+'#/step/999');await page.locator('.chapter-grid').waitFor();
 const retry=await browser.newPage();let fail=true;
 await retry.route('**/data/journey/manifest.json',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.continue());
 await retry.goto(base+'#/step/01');await retry.getByRole('alert').waitFor();fail=false;
 await retry.getByRole('button',{name:'重新加载'}).click();await retry.locator('.lesson-content').waitFor();
 await retry.close();
 assert.deepEqual(errors,[]);
 console.log('[PASS] playback, model scores, anomaly controls, metrics, navigation and retry');
}finally{await browser?.close();server?.kill();}
