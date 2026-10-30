import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';

const base = process.env.SHOWCASE_URL || 'http://127.0.0.1:5176/';
const out = process.env.QA_DIR || '.qa/usability';
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const manifest = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const checks = [],
  errors = [];
try {
  for (let round = 0; round < 1; round++) {
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
  checks.push({ manifestRetryKeepsDeepLink: true });
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '#/training');
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    if (width <= 390) {
      const menu = page.getByRole('button', { name: '目录', exact: true });
      await menu.click();
      await page.getByRole('navigation', { name: '章节导航' }).getByRole('link').first().focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await menu.evaluate((e) => e === document.activeElement), true);
    }
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
    const startInput = page.getByRole('spinbutton', { name: '片段起点' });
    await startInput.fill('');
    assert.equal(await startInput.inputValue(), '');
    await startInput.pressSequentially('500');
    assert.equal(await startInput.inputValue(), '500');
    await startInput.press('Enter');
    assert.equal(await page.getByRole('slider', { name: '选择64点片段' }).inputValue(), '499');
    await startInput.fill('108');
    if (width <= 390) await page.getByLabel('选择测点', { exact: true }).selectOption('5');
    await page.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
    await page.getByTestId('calculated-score').waitFor();
    if (width <= 390) {
      const detail = page.getByRole('region', { name: '当前测点计算明细', exact: true });
      await detail.waitFor();
      assert.deepEqual(
        await detail.locator('dd').allTextContents(),
        await page.locator('.calculation-table .selected-sensor td').allTextContents(),
      );
    }
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
        if (width <= 390) {
          assert.equal(
            await table
              .locator('tbody th')
              .first()
              .evaluate((e) => getComputedStyle(e).position),
            'static',
          );
          const lastValue = table.locator('.selected-sensor td').last();
          const visible = await lastValue.evaluate((e) => {
            const value = e.getBoundingClientRect();
            const viewport = e.closest('.calculation-table-scroll').getBoundingClientRect();
            return value.left >= viewport.left && value.right <= viewport.right;
          });
          assert.equal(visible, true);
        }
        await table.evaluate((e) => (e.scrollLeft = 0));
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: out + '/' + width + '-detection.png', fullPage: true });
    if (width <= 390) {
      await page.goto(base + '#/anomalies');
      await page.locator('.case-label-cells button').last().waitFor();
      await page.getByText('查看构造说明与公式', { exact: true }).click();
      assert.match(
        await page.locator('.case-mobile-explanation').innerText(),
        /用异常素材替代局部原值/,
      );
      await page.locator('.case-methods button').last().click();
      await page.locator('.case-label-cells button').last().waitFor();
      assert.match(
        await page.locator('.case-mobile-explanation').innerText(),
        /原始值 × \(1 − 权重\)/,
      );
      await page.locator('.case-methods button').first().click();
      await page.getByText('查看构造说明与公式', { exact: true }).click();
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
    await page.goto(base + '#/metrics?note=data-cleaning');
    const sensors = page.locator('.sensor-list');
    await sensors.waitFor();
    assert.equal(await page.locator('#sensor-table-hint').isVisible(), true);
    assert.match(await page.locator('#sensor-table-hint').innerText(), /125.*向下滚动/);
    await sensors.focus();
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => document.querySelector('.sensor-list').scrollTop > 0);
    if (width === 1440 || width === 390) {
      await page.goto(base + '#/playback');
      await page.locator('.reconstruction-view').waitFor();
      const progress = page.getByRole('slider', { name: '播放进度' });
      for (const model of manifest.models) {
        await page.getByRole('button', { name: model.name, exact: true }).click();
        for (const [code, name] of [
          ['tp', '检出'],
          ['fp', '误报'],
          ['fn', '漏检'],
        ]) {
          const matches = model.scores.flatMap((score, index) => {
            const actual = manifest.labels[index] > 0;
            const predicted = score > model.threshold;
            const outcome = actual ? (predicted ? 'tp' : 'fn') : predicted ? 'fp' : 'tn';
            return outcome === code ? [index] : [];
          });
          await progress.fill('0');
          const next = page.getByRole('button', { name: '下一处' + name, exact: true });
          await next.click();
          assert.equal(await progress.inputValue(), String(matches[0] + 1));
          await progress.fill(String(matches.at(-1) + 1));
          assert.equal(await next.isDisabled(), true);
        }
      }
      await progress.fill('2397');
      assert.equal(await page.locator('.replay-links button:disabled').count(), 3);
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
    'PASS manifest failure/retry, training MSE notes, independent selection, mobile controls and table hints',
  );
} finally {
  await browser.close();
}
