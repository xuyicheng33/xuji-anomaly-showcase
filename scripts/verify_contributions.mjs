import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, readInput } from './browser.mjs';

const out = qaDirectory('contributions');
await mkdir(out, { recursive: true });
const data = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const f64 = (b) => {
  return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const input = f64(await readInput('public/data/journey', data));
const errorsByModel = await Promise.all(
  data.models.map(async (model) =>
    f64(
      Buffer.concat(
        await Promise.all(
          model.contributions.chunks.map((chunk) => readFile('public/data/journey/' + chunk.file)),
        ),
      ),
    ),
  ),
);
const browser = await launchBrowser();
const errors = [],
  checks = [];
const seek = async (page, count) => {
  await page.getByRole('slider', { name: '播放进度' }).fill(String(count));
  await page.waitForFunction(
    (n) =>
      document.querySelector('.contribution-section')?.getAttribute('data-point') === String(n),
    count,
  );
  await page.getByTestId('contribution-total').waitFor();
};
async function checkPoint(page, modelIndex, index) {
  const m = data.models[modelIndex];
  await seek(page, index + 1);
  const values = errorsByModel[modelIndex].slice(
    index * data.features.length,
    (index + 1) * data.features.length,
  );
  const ranked = Array.from(values, (error, feature) => ({
    feature,
    contribution: error / data.features.length,
  })).sort((a, b) => b.contribution - a.contribution || a.feature - b.feature);
  await page.waitForFunction(
    (value) => document.querySelector('[data-testid=contribution-total]')?.textContent === value,
    m.scores[index].toFixed(9),
  );
  const bars = await page.locator('.contribution-row').evaluateAll((rows) =>
    rows.map((row) => ({
      feature: row.getAttribute('data-feature'),
      value: Number(row.getAttribute('data-contribution')),
    })),
  );
  assert.equal(bars.length, 8);
  for (let i = 0; i < 7; i++) {
    assert.equal(Number(bars[i].feature), ranked[i].feature);
    assert.ok(Math.abs(bars[i].value - ranked[i].contribution) < 1e-15);
  }
  assert.ok(Math.abs(bars.reduce((sum, row) => sum + row.value, 0) - m.scores[index]) < 1e-14);
  await page.locator('.contribution-row').first().click();
  await page.getByTestId('sensor-mean-error').waitFor();
  const feature = ranked[0].feature;
  const first = Math.max(0, index - data.window + 1),
    last = Math.min(index, data.times.length - data.window);
  assert.equal(await page.locator('.window-error-grid button').count(), last - first + 1);
  assert.equal(await page.getByTestId('sensor-mean-error').innerText(), values[feature].toFixed(9));
  for (const local of [...new Set([0, last - first])]) {
    await page.locator('.window-error-grid button').nth(local).click();
    const start = first + local;
    const chunk = m.windows.chunks.find((c) => start >= c.start && start < c.start + c.count);
    const bytes = await readFile('public/data/journey/' + chunk.file);
    const predictions = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const prediction =
      predictions[
        ((start - chunk.start) * data.window + index - start) * data.features.length + feature
      ];
    const value = input[index * data.features.length + feature];
    assert.equal(await page.getByTestId('sensor-window-input').innerText(), value.toFixed(9));
    assert.equal(
      await page.getByTestId('sensor-window-prediction').innerText(),
      prediction.toFixed(9),
    );
    assert.equal(
      await page.getByTestId('sensor-window-error').innerText(),
      ((value - prediction) ** 2).toFixed(9),
    );
  }
}
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(showcaseUrl + '#/playback');
    for (let model = 0; model < 2; model++) {
      await page.getByRole('button', { name: data.models[model].name, exact: true }).click();
      for (const index of [0, 131, 2396]) await checkPoint(page, model, index);
    }
    await page.getByRole('button', { name: data.models[0].name, exact: true }).click();
    await checkPoint(page, 0, 131);
    await page
      .locator('.contribution-section')
      .evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${width}-contribution.png` });
    await page.locator('.sensor-window-detail').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-detail.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#ref-sensor-window-errors').click();
    await page.locator('#note-window-aggregation').waitFor();
    await page.locator('#note-window-aggregation .note-return').click();
    await page.getByTestId('sensor-mean-error').waitFor();
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '132');
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    await page.getByRole('combobox', { name: '贡献测点数量' }).selectOption('12');
    assert.equal(await page.locator('.contribution-row').count(), 13);
    await page.locator('.contribution-other').click();
    assert.equal(await page.locator('.contribution-row').count(), 125);
    await page.locator('.contribution-row').last().click();
    await page.getByTestId('sensor-mean-error').waitFor();
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    await page.getByRole('combobox', { name: '贡献测点数量' }).selectOption('7');
    await page.getByRole('button', { name: '单步', exact: true }).click();
    assert.equal(await page.locator('.sensor-window-detail').count(), 0);
    await page.getByRole('combobox', { name: '播放速度' }).selectOption('16');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.contribution-section')?.getAttribute('data-point')) > 138,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const count = Number(await page.getByRole('slider', { name: '播放进度' }).inputValue());
    assert.equal(
      await page.getByTestId('contribution-total').innerText(),
      data.models[0].scores[count - 1].toFixed(9),
    );
    await page.locator('.contribution-row').first().press('Enter');
    await page.getByTestId('sensor-mean-error').waitFor();
    await page.locator('.window-error-grid button').last().press('Enter');
    assert.equal(
      await page.locator('.window-error-grid button').last().getAttribute('aria-pressed'),
      'true',
    );
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await page.screenshot({ path: `${out}/${width}-zoom.png` });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('body *')]
            .filter((e) => e.getBoundingClientRect().right > innerWidth)
            .slice(0, 12)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              text: e.textContent.slice(0, 70),
              right: e.getBoundingClientRect().right,
            })),
        })),
      ),
    );
    checks.push(
      `${width}: both models, first/interior/last, exact contributions and window values, all sensors, keyboard, 16x, 200%`,
    );
    await page.close();
  }
  for (let repetition = 0; repetition < 3; repetition++) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.route('**/contributions-v1/**/model1/*.bin*', (r) =>
      r.fulfill({ status: 503, body: 'failed' }),
    );
    await page.goto(showcaseUrl + '#/playback');
    await page.getByRole('slider', { name: '播放进度' }).fill('132');
    await page.getByRole('button', { name: '重试贡献数据' }).waitFor();
    await page.unroute('**/contributions-v1/**/model1/*.bin*');
    await page.getByRole('button', { name: '重试贡献数据' }).click();
    await page.getByTestId('contribution-total').waitFor();
    await page.route('**/windows-v1/**/model1/*.bin*', (r) =>
      r.fulfill({ status: 503, body: 'failed' }),
    );
    await page.locator('.contribution-row').first().click();
    await page.getByRole('button', { name: '重试测点明细' }).waitFor();
    await page.unroute('**/windows-v1/**/model1/*.bin*');
    await page.getByRole('button', { name: '重试测点明细' }).click();
    await page.getByTestId('sensor-mean-error').waitFor();
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '132');
    await page.getByRole('button', { name: data.models[1].name, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.sensor-window-detail'));
    await page.waitForFunction(
      (value) => document.querySelector('[data-testid=contribution-total]')?.textContent === value,
      data.models[1].scores[131].toFixed(9),
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/checks.json',
    JSON.stringify({ checks, errors, retryRepetitions: 3 }, null, 2),
  );
  console.log(
    'PASS contribution totals, all sensors, covering windows, touch/keyboard, 200%, 16x and retry/model isolation x3',
  );
} finally {
  await browser.close();
}
