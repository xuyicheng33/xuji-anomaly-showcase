const { chromium }=require('C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');const path=require('path');
const assert=require('assert').strict;
const OUT=path.join(__dirname,'../.runtime/qa');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/?step=1');await page.locator('.hero-visual canvas').waitFor();
 const report=[];
 const goto=async(step)=>{await page.getByLabel('打开流程导航').click();await page.locator('.nav-menu button').nth(step-1).click();};
 const settings=async()=>{const el=page.locator('.model-settings');if(!(await el.getAttribute('open')))await el.locator('summary').click();};
 const inputData=async()=>{await page.locator('.display-options summary').click();await page.getByRole('button',{name:'输入数据',exact:true}).click();};
 for(let ds=0;ds<2;ds++){
  await page.locator('.dataset-switch button').nth(ds).click();
  for(let step=1;step<=10;step++){
   await goto(step);
   await page.locator('h1').waitFor();if(step===10)await page.locator('.scope-panel canvas').waitFor();
   if(step===7)await page.locator('.label-strip i').first().waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
   assert.equal(overflow,false,'horizontal overflow dataset '+ds+' step '+step);
   report.push({dataset:ds,step,title:await page.locator('h1').innerText()});
  }
 }
 await page.locator('.dataset-switch button').nth(0).click();await page.locator('.scope-panel canvas').waitFor();
 await settings();await page.getByLabel('选择检测模型').selectOption('model1');await page.locator('.model-settings summary').click();await page.locator('.scope-panel canvas').waitFor();
 await page.getByLabel('下一个检测事件').click();await page.getByLabel('下一个检测事件').click();
 const cursor=Number(await page.getByLabel('检测播放进度').inputValue());
 const currentF1=await page.locator('.metric-highlight strong').innerText();
 const expected=await page.evaluate(async cursor=>{
  const c=await (await fetch('/api/catalog')).json();const e=c.datasets.converter.experiments.find(e=>e.model==='model1');
  const y=new Uint8Array(await (await fetch(e.files.labels.url)).arrayBuffer());const s=new Float64Array(await (await fetch(e.files.scores.url)).arrayBuffer());
  let tp=0,fp=0,fn=0;for(let i=0;i<=cursor;i++){if(y[i]){if(s[i]>e.threshold)tp++;else fn++;}else if(s[i]>e.threshold)fp++;}
  return 2*tp+fp+fn?(2*tp/(2*tp+fp+fn)*100).toFixed(1)+'%':'—';
 },cursor);assert.equal(currentF1,expected,'prefix metrics match saved arrays');
 await page.getByLabel('开始播放').click();await page.waitForFunction(v=>Number(document.querySelector('[aria-label="检测播放进度"]').value)>v,cursor);
 await page.getByLabel('暂停播放').click();const paused=await page.getByLabel('检测播放进度').inputValue();await page.waitForTimeout(400);
 assert.equal(await page.getByLabel('检测播放进度').inputValue(),paused,'pause holds cursor');
 await page.locator('.analysis-details > summary').click();
 await page.locator('.event-list button').last().click();
 await page.waitForFunction(()=>{
  const panel=document.querySelector('.scope-panel').getBoundingClientRect();
  const main=document.querySelector('main').getBoundingClientRect();
  return panel.top>=main.top-1 && panel.top<main.top+40;
 });
 await page.locator('.return-location').click();
 assert.equal(await page.getByLabel('检测播放进度').inputValue(),paused,'event return restores position');
 await page.locator('.analysis-details > summary').click();
 await page.screenshot({path:path.join(OUT,'detection-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'实时推理',exact:true}).click();await page.getByRole('button',{name:'计算当前窗口',exact:true}).click();
 await page.locator('.state-footer').filter({hasText:'ms'}).waitFor();assert.notEqual(await page.locator('.score-value strong').innerText(),'—');
 await inputData();await page.locator('input[type=file]').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('a,b\n1,2')});
 await page.locator('[role=alert]').filter({hasText:'表头必须'}).waitFor();assert(await page.getByRole('button',{name:'选择CSV',exact:true}).isVisible());
 await page.locator('.dataset-switch button').nth(1).click();await page.locator('.scope-panel canvas').waitFor();
 await page.getByRole('button',{name:'实时推理',exact:true}).click();await inputData();
 const csv=Array.from({length:70},(_,i)=>Array.from({length:7},(_,j)=>.2+Math.sin(i/8+j)*.1).join(',')).join('\n');
 await page.locator('input[type=file]').setInputFiles({name:'compatible.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.getByRole('button',{name:'计算当前窗口',exact:true}).click();await page.locator('.state-footer').filter({hasText:'ms'}).waitFor();assert.equal(await page.locator('.metric-highlight strong').innerText(),'—','unlabeled uploaded input has no F1');
 await goto(7);await page.locator('.label-strip i').first().waitFor();
 for(const name of ['软替换','均匀替换','峰值噪声','长度调整']){
  await page.locator('.method').filter({hasText:name}).click();await page.locator('.panel.pending').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'动态注入',exact:true}).click();await page.getByRole('button',{name:'重新生成',exact:true}).click();
  await page.locator('.panel.pending').waitFor({state:'hidden'});await page.getByRole('button',{name:'固定注入',exact:true}).click();
 }
 await page.screenshot({path:path.join(OUT,'anomalies-desktop.png'),fullPage:true});
 await goto(1);await page.screenshot({path:path.join(OUT,'home-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});for(const step of [1,3,7,8,10]){
  await goto(step);if(step===10)await page.locator('.scope-panel canvas').waitFor();
  if(step===8){
   await page.locator('.architecture-mobile').waitFor();
   await page.locator('.model-card').nth(1).click();
   assert.equal(await page.locator('.model-card').nth(1).getAttribute('aria-pressed'),'true');
   assert((await page.locator('.architecture-mobile').textContent()).includes('变量空间注意力'));
  }
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1,{timeout:2000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'mobile overflow '+step);
 }
 await page.screenshot({path:path.join(OUT,'detection-mobile.png'),fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});await goto(1);
 assert.equal(await page.locator('.stage').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion');
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({stages:report,prefixMetrics:true,playPause:true,sixModelBackend:'verified separately',csv:true,anomalyControls:true,mobile:true,reducedMotion:true,consoleErrors:errors},null,2));
 console.log(JSON.stringify({testedStages:report.length,prefixMetrics:true,playPause:true,csv:true,anomalyControls:true,mobile:true,reducedMotion:true,consoleErrors:errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});

