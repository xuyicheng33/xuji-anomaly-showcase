import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, selectFeature, featureValue } from './browser.mjs';

const out = qaDirectory('feature_picker');
await mkdir(out, { recursive: true });
const data = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const browser = await launchBrowser();
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(showcaseUrl + '#/playback');
    await page.getByRole('slider', { name: '播放进度' }).fill('132');
    const trigger = page.getByRole('button', { name: '选择测点', exact: true });
    await trigger.click();
    const search = page.getByRole('searchbox', { name: '搜索测点' });
    await search.fill('20B01_A_P_a');
    assert.equal(await page.locator('.feature-option').count(), 1);
    assert.match(await page.locator('.feature-option').innerText(), /有功功率.*极2组1/);
    await search.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await featureValue(page), '22');
    await trigger.click();
    await search.fill('不存在的测点');
    assert.equal(await page.locator('.feature-option').count(), 0);
    await search.press('Escape');
    assert.equal(await featureValue(page), '22');
    assert.equal(await trigger.evaluate((e) => e === document.activeElement), true);
    await trigger.click();
    await page.getByRole('button', { name: '电流', exact: true }).click();
    assert.equal(await page.locator('.feature-option').count(), 16);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${width}-picker.png` });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await selectFeature(page, '-1');
    await page.getByRole('combobox', { name: '贡献测点数量' }).selectOption('125');
    await page.getByRole('searchbox', { name: '查找贡献测点' }).fill('20B01_A_Q_a');
    assert.equal(await page.locator('.contribution-row').count(), 1);
    const total = await page.getByTestId('contribution-total').innerText();
    await page.locator('.contribution-row').click();
    await page.getByTestId('sensor-mean-error').waitFor();
    if (width < 760) {
      await page.waitForFunction(() => {
        const heading = document.querySelector('.sensor-detail-heading')?.getBoundingClientRect();
        return heading && heading.top >= 0 && heading.bottom < innerHeight;
      });
    }
    assert.equal(total, data.models[0].scores[131].toFixed(9));
    await page.locator('.window-error-grid button').last().click();
    assert.match(await page.locator('.window-cell-detail').innerText(), /64 \/ 64.*第 132—195 点/s);
    await page.locator('.window-prediction-point').first().click();
    assert.equal(
      await page.locator('.window-error-grid button').first().getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('.sensor-window-detail').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-detail.png` });
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/${width}-detail-200.png` });
    await page.evaluate(() => (document.documentElement.style.zoom = '1'));
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    await page.waitForFunction(() => {
      const origin = document.querySelector('.contribution-row');
      return origin === document.activeElement && !document.querySelector('.sensor-window-detail');
    });
    if (width < 760) {
      await page.waitForFunction(() => {
        const row = document.querySelector('.contribution-row')?.getBoundingClientRect();
        return row && row.top >= 0 && row.bottom < innerHeight;
      });
    }
    await page.goto(showcaseUrl + '#/anomalies');
    await page.locator('.case-stage').waitFor();
    await page.getByRole('button', { name: '案例测点', exact: true }).click();
    assert.equal(await page.locator('.feature-option').count(), 32);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.goto(showcaseUrl + '#/data');
    if (width <= 390) {
      const comparison = page.getByRole('region', {
        name: '缺失值填零前后对照，可左右滚动',
      });
      await comparison.waitFor();
      assert.ok(
        await comparison.evaluate((element) => element.scrollWidth <= element.clientWidth),
        'The missing-value result fits beside the original on mobile',
      );
      assert.match(await comparison.locator('.filled-row').innerText(), /缺失.*0.*已填补/s);
    }
    await page.locator('#ref-data-test-count').click();
    await page.locator('#note-data-split:focus').waitFor();
    await page.locator('#note-data-split .note-return').click();
    await page.locator('#ref-data-test-count:focus').waitFor();
    await page.close();
    console.log(
      `PASS ${width}px searchable selection, dictionary names, cancellation, case restriction, contribution search, detail positioning/return, plot/grid and 200%`,
    );
  }
  for (const [width, height, zoom] of [
    [768, 600, 1],
    [320, 844, 2],
    [390, 844, 2],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    await page.goto(showcaseUrl + '#/training');
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((value) => (document.documentElement.style.zoom = String(value)), zoom);
    await page.getByRole('button', { name: '训练测点', exact: true }).click();
    const panel = await page.getByRole('dialog').boundingBox();
    const options = await page.locator('.feature-options').boundingBox();
    assert.ok(
      panel.x >= 0 &&
        panel.y >= 0 &&
        panel.x + panel.width <= width + 1 &&
        panel.y + panel.height <= height + 1,
      'The searchable picker fits the available viewport, including high zoom',
    );
    assert.ok(options.height >= 60, 'Search results remain reachable');
    assert.ok(
      await page.locator('.feature-groups').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.children).every((button) => {
          const box = button.getBoundingClientRect();
          return box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
        });
      }),
      'Every category is fully visible without clipping button text',
    );
    await page.screenshot({ path: `${out}/${width}-${height}-picker-${zoom}.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    if (zoom === 2) {
      const metrics = page.locator('.training-metrics');
      await metrics.scrollIntoViewIfNeeded();
      assert.ok(await metrics.evaluate((element) => element.scrollWidth <= element.clientWidth));
      assert.equal(
        await metrics.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
        1,
        'High-zoom metrics use one column without breaking numbers into characters',
      );
      await page.screenshot({ path: `${out}/${width}-training-metrics-200.png` });
    }
    await page.close();
  }
  console.log('PASS missing-value comparison, short-view picker bounds and readable 200% metrics');
} finally {
  await browser.close();
}
