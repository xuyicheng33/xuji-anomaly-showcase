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
    await page.locator('#ref-data-test-count').click();
    await page.locator('#note-data-split:focus').waitFor();
    await page.locator('#note-data-split .note-return').click();
    await page.locator('#ref-data-test-count:focus').waitFor();
    await page.close();
    console.log(
      `PASS ${width}px searchable selection, dictionary names, cancellation, case restriction, contribution search, detail positioning/return, plot/grid and 200%`,
    );
  }
} finally {
  await browser.close();
}
