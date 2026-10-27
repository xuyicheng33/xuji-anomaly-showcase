import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const pages = JSON.parse(await readFile('src/content/pages.json', 'utf8'));
const externalUrl = process.env.SHOWCASE_URL;
const base = externalUrl || 'http://127.0.0.1:4173/';
const server = externalUrl ? null : spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'pipe', windowsHide: true });
const results = [], errors = [];
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  await mkdir('.qa/screens', { recursive: true });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    await page.locator('.canvas').waitFor();
    for (const step of pages) {
      await page.evaluate(id => { location.hash = `#/step/${String(id).padStart(2, '0')}`; }, step.id);
      await page.waitForFunction(title => document.querySelector('h1')?.textContent === title, step.title);
      await page.locator('.canvas').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('h1').textContent(), step.title);
      const measurements = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, mainWidth: document.querySelector('main').scrollWidth, mainClient: document.querySelector('main').clientWidth, viewport: innerWidth, text: document.querySelector('.canvas').textContent.trim().length }));
      assert.ok(measurements.width <= viewport.width, `Step ${step.id} overflows at ${viewport.width}: ${measurements.width}`);
      assert.ok(measurements.mainWidth <= measurements.mainClient, `Step ${step.id} main content overflows at ${viewport.width}`);
      assert.ok(measurements.text > 35, `Step ${step.id} has no content`);
      await page.locator('.canvas img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
      await page.screenshot({ path: `.qa/screens/${viewport.width}-${String(step.id).padStart(2, '0')}.png`, fullPage: true });
      results.push({ step: step.id, viewport: viewport.width, width: measurements.width });
    }
    await page.close();
    console.log(`[PASS] 61 pages at ${viewport.width} × ${viewport.height}`);
  }
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  const go = async id => { await page.goto(`${base}#/step/${String(id).padStart(2, '0')}`); await page.locator('.canvas').waitFor(); };
  await go(22);
  await page.locator('.feature-groups section').nth(2).getByRole('button').nth(3).click();
  const selected = await page.locator('.feature-selected code').textContent();
  await page.getByRole('button', { name: '下一页' }).click();
  await page.getByRole('button', { name: '上一页' }).click();
  assert.equal(await page.locator('.feature-selected code').textContent(), selected);
  await page.getByRole('button', { name: '全部页面' }).click();
  await page.screenshot({ path: '.qa/screens/state-contents.png' });
  assert.equal(await page.locator('#contents li a').count(), 61);
  await page.locator('#contents a[href="#/step/57"]').click();
  await page.waitForFunction(() => location.hash === '#/step/57');
  assert.equal(await page.locator('#contents').count(), 0);
  const before = page.url();
  await page.locator('.range-control input').focus();
  const initial = await page.locator('.range-control input').inputValue();
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.locator('.range-control input').inputValue(), initial);
  assert.equal(page.url(), before, 'Range arrow must not navigate');
  await page.locator('h1').focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => location.hash === '#/step/56');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/step/57');
  await page.reload(); await page.locator('.canvas').waitFor();
  assert.equal(await page.locator('h1').textContent(), pages[56].title);
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#/step/57');
  assert.equal(await page.locator('h1').evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('End');
  await page.waitForFunction(() => location.hash === '#/step/61');
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), true);
  await page.getByRole('searchbox').fill('不存在的来源');
  assert.equal(await page.getByRole('status').textContent(), '没有匹配材料。请更换关键词。');
  await page.screenshot({ path: '.qa/screens/state-empty.png' });
  await page.getByRole('searchbox').fill('检查点');
  assert.equal(await page.locator('.source-inventory details').count(), 1);
  await page.getByRole('searchbox').clear();
  await page.getByRole('button', { name: '查看来源' }).click();
  await page.locator('#source-details details').first().locator('summary').click();
  assert.match(await page.locator('#source-details').textContent(), /SHA-256/);
  await page.screenshot({ path: '.qa/screens/state-source.png' });
  await page.keyboard.press('Escape');
  await page.locator('h1').focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => location.hash === '#/step/01');
  await page.waitForFunction(title => document.querySelector('h1')?.textContent === title, pages[0].title);
  assert.equal(await page.getByRole('button', { name: '上一页' }).isDisabled(), true);
  await go(52);
  const previousCoverage = await page.locator('.controls output').textContent();
  await page.locator('.controls input').fill('0');
  assert.notEqual(await page.locator('.controls output').textContent(), previousCoverage);
  await go(58);
  await page.getByRole('button', { name: 'FP 误报' }).click();
  assert.match(await page.locator('.confusion-definition').textContent(), /真实正常/);
  await go(43);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '报告原图' }).nth(i).click();
    await page.locator('.report-figure img').evaluate(img => img.decode());
    await page.locator('.report-figure').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.qa/screens/state-model-${i + 1}.png` });
    assert.equal(await page.locator('.report-figure img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.getByRole('button', { name: '收起原图' }).click();
  }
  await page.close();
  const recovery = await browser.newPage();
  let fail = true;
  await recovery.route('**/data/research.json', route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
  await recovery.goto(base);
  await recovery.getByRole('alert').waitFor();
  await recovery.screenshot({ path: '.qa/screens/state-error.png' });
  fail = false;
  await recovery.getByRole('button', { name: '重新载入' }).click();
  await recovery.locator('.canvas').waitFor();
  await recovery.close();
  assert.deepEqual(errors, []);
  await writeFile('.qa/browser-report.json', JSON.stringify({ passed: results.length, viewports: 3, interactions: 'navigation, history, reload, inputs, sources, error recovery', errors, results }, null, 2));
  console.log('[PASS] Navigation, selection persistence, source traceability, keyboard, history, native controls, saved images and load recovery');
} finally {
  await browser?.close();
  server?.kill();
}
