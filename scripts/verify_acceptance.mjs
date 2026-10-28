import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SHOWCASE_URL||'http://127.0.0.1:5176/';
const folder='.qa/acceptance-20261028/final';await mkdir(folder,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const originalNewPage=b.newPage.bind(b);b.newPage=async(...args)=>{const page=await originalNewPage(...args);page.setDefaultTimeout(Number(process.env.BROWSER_TIMEOUT||60000));return page};
const errors=[],checks=[];
try{
 for(const width of [1440,390]){
  const p=await b.newPage({viewport:{width,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(base+'#/anomalies');await p.locator('.case-stage').waitFor();await p.locator('.case-kinds button').filter({hasText:'长度调整'}).click();await p.locator('.length-source').waitFor();
  const bounds=await p.locator('.case-stage .curve').evaluate(e=>[e.dataset.yMin,e.dataset.yMax]);
  for(const step of ['原始片段','异常素材','插入过程','标签结果']){await p.getByRole('button',{name:step,exact:true}).click();assert.deepEqual(await p.locator('.case-stage .curve').evaluate(e=>[e.dataset.yMin,e.dataset.yMax]),bounds)}
  await p.getByRole('button',{name:'查看来源第 26 点',exact:true}).click();assert.match(await p.locator('.length-mapping').innerText(),/40—42/);assert.equal(await p.locator('.length-destination button[aria-pressed=true]').count(),3);assert.equal(await p.locator('.length-destination button').count(),24);
  await p.locator('.length-construction summary').click();assert.match(await p.locator('.length-construction .report-note').innerText(),/A、C、E、G/);
  await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:folder+'/'+width+'-length.png',fullPage:true});
  if(width===390){await p.locator('.length-construction').screenshot({path:folder+'/390-sampling.png'});await p.evaluate(()=>document.documentElement.style.zoom='2');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.evaluate(()=>document.documentElement.style.zoom='1')}
  checks.push({width,lengthSourceH:'40—42',materialCount:24,stableDomain:bounds});
  for(const route of ['models','training','detection']){
   await p.goto(base+'#/'+route);await p.locator('h1').waitFor();
   if(route==='training')await p.getByRole('img',{name:'归一化训练数据',exact:true}).waitFor();
   if(route==='detection'){await p.getByRole('button',{name:'查看模型结果 →',exact:true}).click();await p.getByTestId('calculated-score').waitFor();assert.equal(await p.locator('.reconstruction-view .legend .line-dashed').count(),1);}
   await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:folder+'/'+width+'-'+route+'.png',fullPage:true});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await p.close();
 }
 const p=await b.newPage({viewport:{width:390,height:900}});p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(base+'#/anomalies');await p.locator('.case-stage').waitFor();
 for(let i=0;i<3;i++){
  await p.getByRole('button',{name:'原始片段',exact:true}).click();await p.evaluate(()=>window.scrollTo(0,0));await p.getByRole('button',{name:'播放构造',exact:true}).click();
  await p.waitForFunction(()=>{const r=document.querySelector('.case-stage .curve svg').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});
  await p.getByRole('button',{name:'暂停',exact:true}).click();const phase=await p.locator('.case-stage').getAttribute('data-phase');
  assert.ok(Number(phase)<3);if(i===0)await p.screenshot({path:folder+'/390-play-visible.png'});
 }
 checks.push({mobilePlaybackVisible:3});await p.close();assert.deepEqual(errors,[]);
 await writeFile(folder+'/checks.json',JSON.stringify({checks,errors},null,2));console.log('PASS length H mapping, 24 destination points, shortening, stable axes, 200% layout, loaded training charts, dashed reconstruction and mobile autoplay positioning x3');
}finally{await b.close()}
