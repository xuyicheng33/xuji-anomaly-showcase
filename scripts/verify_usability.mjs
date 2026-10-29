import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';

const base = process.env.SHOWCASE_URL || 'http://127.0.0.1:5176/';
const out = process.env.QA_DIR || '.qa/usability';
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const checks = [],
  errors = [];
try {
  for (let round = 0; round < 3; round++) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    let failing = true;
    await page.route('**/data/journey/manifest.json', (r) =>
      failing ? r.fulfill({ status: 503, body: 'unavailable' }) : r.continue(),
    );
    await page.goto(base + '#/metrics?note=training-mse');
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /资料读取失败/);
    failing = false;
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.locator('#note-training-mse:focus').waitFor();
    assert.equal(await page.locator('[role=alert]:visible').count(), 0);
    assert.equal(await page.locator('.explanation-entry').count(), 13);
    await page.close();
  }
  checks.push({ manifestRetryKeepsDeepLink: 3 });
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '#/training');
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    assert.equal(await page.locator('.curve-selection').count(), 1);
    assert.equal(await page.locator('[data-anomaly-start]').count(), 0);
    assert.equal(await page.locator('.curve-selection').getAttribute('fill'), '#355f7b');
    await page.getByRole('slider', { name: '训练窗口位置' }).fill('320');
    await page.getByRole('slider', { name: '训练轮次' }).fill('7');
    await page.locator('#ref-training-mse-section').click();
    await page.locator('#note-training-mse:focus').waitFor();
    assert.match(await page.locator('#note-training-mse').innerText(), /各批次的均值取平均/);
    assert.doesNotMatch(
      await page.locator('main').innerText(),
      /并不代表|是不是|这不意味着|不代表|并非/,
    );
    await page.locator('#note-training-mse .note-return').click();
    assert.equal(await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(), '320');
    assert.equal(await page.getByRole('slider', { name: '训练轮次' }).inputValue(), '7');
    await page.getByRole('img', { name: '训练重建误差（MSE）', exact: true }).waitFor();
    await page.goto(base + '#/detection');
    await page.locator('.reconstruction-view').waitFor();
    await page.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
    await page.getByTestId('calculated-score').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const chartTop = await page
      .locator('.reconstruction-view svg')
      .evaluate((e) => e.getBoundingClientRect().top);
    if (width === 390) assert.ok(chartTop < 720, 'Mobile plot starts too low: ' + chartTop);
    if (width <= 768) {
      const hint = page.locator('#window-calculation-scroll-hint');
      assert.equal(await hint.isVisible(), true);
      const table = page.locator('.calculation-table-scroll');
      const data = await table.evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
      if (data.scroll > data.width) {
        await table.evaluate((e) => (e.scrollLeft = e.scrollWidth));
        assert.ok((await table.evaluate((e) => e.scrollLeft)) > 0);
        await table.evaluate((e) => (e.scrollLeft = 0));
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: out + '/' + width + '-detection.png', fullPage: true });
    if (width <= 390) {
      await page.goto(base + '#/anomalies');
      await page.locator('.case-label-cells button').last().waitFor();
      await page.getByRole('button', { name: '标签结果', exact: true }).click();
      const selected = () => page.locator('.case-label-cells [aria-pressed=true]');
      await page.getByRole('button', { name: '前一点', exact: true }).click();
      assert.match(await selected().getAttribute('aria-label'), /^第 30 点/);
      await page.getByRole('button', { name: '后一点', exact: true }).click();
      assert.match(await selected().getAttribute('aria-label'), /^第 31 点/);
      await page.locator('.case-label-cells button').first().click({ force: true });
      assert.equal(
        await page.getByRole('button', { name: '前一点', exact: true }).isDisabled(),
        true,
      );
      await page.locator('.case-label-cells button').last().click({ force: true });
      assert.equal(
        await page.getByRole('button', { name: '后一点', exact: true }).isDisabled(),
        true,
      );
      const size = await page.getByRole('button', { name: '前一点', exact: true }).boundingBox();
      assert.ok(size.width >= 60 && size.height >= 40);
      await page.locator('#ref-anomalies-point-labels').click();
      await page.locator('#note-anomaly-cases:focus').waitFor();
      await page.locator('#note-anomaly-cases .note-return').click();
      assert.match(await selected().getAttribute('aria-label'), /^第 64 点/);
      await page.screenshot({ path: out + '/' + width + '-anomalies.png', fullPage: true });
    }
    checks.push({
      width,
      chartTop,
      trainingRangeIndependent: true,
      mseRoundTrip: true,
      tableHint: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(out + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(
    'PASS manifest failure/retry x3, training MSE notes, independent selection, mobile controls and table hints',
  );
} finally {
  await browser.close();
}
