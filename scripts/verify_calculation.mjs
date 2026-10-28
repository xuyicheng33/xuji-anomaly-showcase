import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.SHOWCASE_URL||'http://127.0.0.1:5176/';
const out=process.env.QA_DIR||'.qa/calculation-20261028';await mkdir(out,{recursive:true});
const data=JSON.parse(await readFile('public/data/journey/manifest.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],checks=[];
const array=async file=>{const b=await readFile('public/data/journey/'+file);return new Float64Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length))};
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'#/detection');await page.getByRole('button',{name:'查看模型结果 →',exact:true}).click();await page.getByTestId('calculated-score').waitFor();
  await page.getByRole('slider',{name:'片段查看时刻'}).fill('25');await page.waitForFunction(()=>document.querySelector('#window-calculation')?.getAttribute('data-point')==='133');
  assert.equal(await page.getByTestId('window-calculation-sum').innerText(),'4.976624427');assert.equal(await page.getByTestId('calculated-score').innerText(),'0.039812995');assert.equal(await page.locator('#window-calculation tbody tr').count(),125);
  await page.locator('#window-calculation').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/'+width+'-calculation.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#ref-window-calculation').click();await page.locator('#note-score-calculation:focus').waitFor();assert.equal(await page.locator('.explanation-entry').count(),11);
  await page.locator('#note-score-calculation .note-return').click();await page.getByTestId('calculated-score').waitFor();assert.equal(await page.getByRole('slider',{name:'片段查看时刻'}).inputValue(),'25');assert.equal(await page.getByTestId('calculated-score').innerText(),'0.039812995');
  await page.goto(base+'#/playback');await page.getByRole('slider',{name:'播放进度'}).fill('133');await page.getByRole('button',{name:'查看当前点计算',exact:false}).click();await page.getByTestId('aggregate-equation').waitFor();
  assert.equal(await page.locator('.window-score-scroll tbody tr').count(),64);assert.match(await page.getByTestId('aggregate-equation').innerText(),/2.566477956 ÷ 64 = 0.040101218/);
  await page.locator('.window-score-scroll tbody tr').filter({hasText:'第 108—171 点'}).getByRole('button').click();await page.getByTestId('coverage-window-calculation-score').waitFor();assert.equal(await page.getByTestId('coverage-window-calculation-score').innerText(),'0.039812995');
  await page.getByRole('slider',{name:'播放进度'}).fill('1');await page.getByTestId('aggregate-equation').waitFor();assert.equal(await page.locator('.window-score-scroll tbody tr').count(),1);
  await page.getByRole('slider',{name:'播放进度'}).fill('2397');await page.getByTestId('aggregate-equation').waitFor();assert.equal(await page.locator('.window-score-scroll tbody tr').count(),1);
  await page.getByRole('slider',{name:'播放进度'}).fill('133');await page.locator('.aggregation-summary').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+width+'-aggregation.png'});
  await page.getByRole('combobox',{name:'播放速度'}).selectOption('2');await page.getByRole('link',{name:'注 11：连续回放与跨窗口合并'}).click();await page.locator('#note-window-aggregation:focus').waitFor();await page.locator('#note-window-aggregation .note-return').click();assert.equal(await page.getByRole('slider',{name:'播放进度'}).inputValue(),'133');assert.equal(await page.getByRole('combobox',{name:'播放速度'}).inputValue(),'2');assert.ok(await page.getByRole('button',{name:'播放',exact:true}).isVisible());
  await page.goto(base+'#/data');await page.getByRole('img',{name:'原始记录',exact:true}).waitFor();await page.getByRole('combobox',{name:'数据测点',exact:true}).selectOption('54');await page.getByRole('slider',{name:'数据片段起点'}).fill('200');await page.getByRole('button',{name:'整理结果',exact:true}).click();await page.getByRole('link',{name:'注 1：原始记录与处理明细'}).click();await page.locator('.reference-table-scroll tbody tr').first().waitFor();assert.ok(page.url().includes('feature=54'));assert.ok(page.url().includes('from=200'));await page.locator('#note-data-records .note-return').click();assert.equal(await page.getByRole('combobox',{name:'数据测点',exact:true}).inputValue(),'54');assert.equal(await page.getByRole('slider',{name:'数据片段起点'}).inputValue(),'200');assert.equal(await page.getByRole('button',{name:'整理结果',exact:true}).getAttribute('aria-pressed'),'true');
  await page.goto(base+'#/metrics?note=thresholds');await page.locator('#note-thresholds:focus').waitFor();await page.screenshot({path:out+'/'+width+'-notes.png'});await page.reload();await page.locator('#note-thresholds:focus').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width===1440){await page.evaluate(()=>document.documentElement.style.zoom='2');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
  checks.push({width,all125Rows:true,exactCalculation:true,all64Windows:true,edgeCoverage:true,roundTrip:true,deepLinkReload:true});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'#/playback');
 for(let rep=0;rep<3;rep++){
  await page.getByRole('slider',{name:'播放进度'}).fill('130');await page.getByRole('button',{name:'播放',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="播放进度"]').value)>130);await page.getByRole('link',{name:'注 11：连续回放与跨窗口合并'}).click();await page.locator('#note-window-aggregation:focus').waitFor();await page.locator('#note-window-aggregation .note-return').click();const n=await page.getByRole('slider',{name:'播放进度'}).inputValue();await page.waitForTimeout(700);assert.equal(await page.getByRole('slider',{name:'播放进度'}).inputValue(),n);assert.ok(await page.getByRole('button',{name:'播放',exact:true}).isVisible());
 }
 checks.push({playingRoundTripPauses:3});await page.close();
 assert.deepEqual(errors,[]);await writeFile(out+'/checks.json',JSON.stringify({checks,errors},null,2));console.log('PASS calculation, coverage, footnotes, mobile/desktop, 200%, deep links, state retention and pause x3');
}finally{await browser.close()}
