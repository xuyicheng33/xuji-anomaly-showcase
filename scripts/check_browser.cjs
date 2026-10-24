const { chromium } = require('C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const output = path.join(__dirname, '../.runtime/qa');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?step=1');
  await page.locator('.hero-visual canvas').waitFor();
  const goto = async step => {
    await page.getByLabel('打开流程导航').click();
    await page.locator('.nav-menu button').nth(step - 1).click();
  };
  const cat = await page.evaluate(async () => (await fetch('/api/catalog')).json());
  assert.deepEqual(Object.keys(cat.datasets), ['converter']);
  const stages = [];
  for (let step = 1; step <= 10; step++) {
    await goto(step);
    await page.locator('h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    stages.push(await page.locator('h1').innerText());
  }
  assert.equal(await page.getByRole('button', { name: '实时推理', exact: true }).count(), 0);
  const modelMetrics = [];
  for (const exp of cat.datasets.converter.experiments) {
    await page.locator('.model-settings summary').click();
    await page.getByLabel('选择检测模型').selectOption(exp.model);
    await page.locator('.model-settings summary').click();
    const expected = (exp.metrics.adjusted.f1 * 100).toFixed(1) + '%';
    await page.waitForFunction(text => document.querySelector('.metric-highlight strong')?.textContent === text, expected);
    await page.locator('.analysis-details > summary').click();
    const counts = await page.locator('.confusion-cell b').allTextContents();
    assert.deepEqual(counts.map(s => Number(s.replaceAll(',', ''))), ['tp', 'fp', 'fn', 'tn'].map(k => exp.metrics.adjusted[k]));
    await page.locator('.analysis-details > summary').click();
    await page.getByLabel('下一个检测事件').click();
    assert.equal(await page.locator('.metric-highlight strong').innerText(), expected, 'whole-test PA metrics stay fixed during playback');
    const aligned = await page.evaluate(async () => {
      const source = await (await fetch('/src/Chart.tsx')).text();
      const module = source.match(/from "([^"]*echarts_core[^"]*)"/)[1];
      const echarts = await import(module);
      const chart = echarts.getInstanceByDom(document.querySelector('.scope-panel .chart'));
      const option = chart.getOption();
      const cursor = Number(document.querySelector('[aria-label="检测播放进度"]').value);
      const ordinal = option.xAxis[0].data.findIndex(x => Number(x) === cursor);
      return option.series.filter(s => s.markLine).every(s => Math.abs(chart.convertToPixel({ xAxisIndex: s.xAxisIndex || 0 }, s.markLine.data[0].xAxis) - chart.convertToPixel({ xAxisIndex: 0 }, ordinal)) < 1);
    });
    assert(aligned, 'time markers align');
    modelMetrics.push({ model: exp.model, f1: expected });
  }
  const cursor = Number(await page.getByLabel('检测播放进度').inputValue());
  await page.getByLabel('开始播放').click();
  await page.waitForFunction(i => Number(document.querySelector('[aria-label="检测播放进度"]').value) > i, cursor);
  await page.getByLabel('暂停播放').click();
  const paused = await page.getByLabel('检测播放进度').inputValue();
  await page.waitForTimeout(300);
  assert.equal(await page.getByLabel('检测播放进度').inputValue(), paused);
  await page.locator('.analysis-details > summary').click();
  await page.locator('.event-list button').last().click();
  await page.waitForFunction(() => document.querySelector('.scope-panel').getBoundingClientRect().top >= document.querySelector('main').getBoundingClientRect().top - 1);
  await page.locator('.return-location').click();
  assert.equal(await page.getByLabel('检测播放进度').inputValue(), paused);
  await page.locator('.analysis-details > summary').click();
  await page.screenshot({ path: path.join(output, 'official-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const step of [1, 3, 7, 8, 9, 10]) {
    await goto(step);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (step === 8) await page.locator('.architecture-mobile').waitFor();
    if (step === 9) assert.equal(await page.getByRole('button', { name: '提交训练' }).count(), 0);
  }
  await page.screenshot({ path: path.join(output, 'official-mobile.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goto(1);
  assert.equal(await page.locator('.stage').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  const report = { stages, modelMetrics, officialOnly: true, pointAdjust: true, markerAlignment: true, playback: true, eventReturn: true, mobile: true, reducedMotion: true, consoleErrors: errors };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
