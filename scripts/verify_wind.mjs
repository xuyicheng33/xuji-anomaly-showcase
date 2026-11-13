import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, selectFeature, readInput } from './browser.mjs';

const out = qaDirectory('wind');
await mkdir(out, { recursive: true });
const data = JSON.parse(await readFile('public/data/wind/manifest.json', 'utf8'));
const model = data.models[0];
const input = await readInput('public/data/wind', data);
const cases = JSON.parse(await readFile(`public/data/wind/${data.cases.file}`, 'utf8'));
const browser = await launchBrowser();
const base = new URL(showcaseUrl);
base.search = '?dataset=wind';
base.hash = '';
const windUrl = base.href;
const errors = [];
try {
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', (e) => errors.push(e.message));
    const failed = [];
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(r.url());
    });
    await page.goto(showcaseUrl);
    await page.getByRole('link', { name: '风电数据集 →', exact: true }).click();
    await page.getByRole('heading', { name: '风电设备 异常检测研究' }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('dataset'), 'wind');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${device}-home.png` });
    await page.getByRole('link', { name: '开始查看', exact: true }).click();
    await page.getByText('功率与天气数据构成', { exact: false }).first().waitFor();
    await page.locator('.normalization-section').scrollIntoViewIfNeeded();
    await page.locator('.normalization-equation').waitFor();
    assert.match(await page.locator('.normalization-equation').innerText(), /0.0001/);
    await selectFeature(page, 27, '归一化测点');
    await page.locator('.normalization-equation').waitFor();
    const key = data.features[27].key;
    const train = await readFile(`public/data/wind/curves-v1/${data.datasets.train.sha256}/27.bin`);
    const column = Array.from({ length: data.datasets.train.shape[0] }, (_, i) =>
      train.readDoubleLE(i * 8),
    );
    const expected =
      (column[5299] - Math.min(...column)) / (Math.max(...column) - Math.min(...column) + 0.0001);
    await page.waitForFunction(
      (value) => document.querySelector('.equation-result strong')?.textContent === value,
      expected.toFixed(4),
    );
    await page.screenshot({ path: `${out}/${device}-normalization.png` });
    await page.goto(windUrl + '#/training');
    await page.getByRole('slider', { name: '训练轮次' }).fill('4');
    assert.match(await page.locator('.training-metrics').innerText(), /0.07348/);
    await page.getByRole('button', { name: '末个窗口', exact: true }).click();
    assert.equal(await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(), '6067');

    await page.goto(windUrl + '#/detection');
    for (const start of [0, 1282, 2564]) {
      await page.getByRole('spinbutton', { name: '片段起点' }).fill(String(start + 1));
      await page.getByRole('button', { name: /查看模型结果|重新查看结果/ }).click();
      await page.locator('.score-calculation').waitFor();
      assert.equal(await page.locator('.score-calculation tbody tr').count(), 28);
      const chunk = model.windows.chunks.find((c) => start >= c.start && start < c.start + c.count);
      const predictions = await readFile('public/data/wind/' + chunk.file);
      const point = Number(await page.locator('.score-calculation').getAttribute('data-point')) - 1;
      const local = point - start;
      const row = page.locator('.score-calculation tbody tr').nth(27);
      const x = input.readDoubleLE((point * 28 + 27) * 8);
      const pred = predictions.readFloatLE(((start - chunk.start) * 64 * 28 + local * 28 + 27) * 4);
      const text = await row.innerText();
      assert.ok(text.includes(x.toFixed(9)), text);
      assert.ok(text.includes(pred.toFixed(9)), text);
      assert.ok(text.includes(((x - pred) ** 2).toFixed(9)), text);
    }
    await page.getByRole('button', { name: '漏检片段', exact: true }).click();
    assert.equal(await page.locator('.example-picker button[aria-pressed=true]').count(), 1);
    assert.equal(
      await page.locator('.example-picker button[aria-pressed=true]').innerText(),
      '漏检片段',
    );
    await page.getByRole('button', { name: /查看模型结果|重新查看结果/ }).click();
    await page.getByTestId('calculated-score').waitFor();
    assert.equal(await page.locator('#window-calculation').getAttribute('data-point'), '21');
    if (device === 'mobile')
      await page.getByRole('button', { name: '查看全部 28 个测点明细', exact: true }).click();
    await page.locator('#ref-window-calculation-label').click();
    await page.locator('#note-anomaly-labels:focus').waitFor();
    await page.locator('#note-anomaly-labels .note-return').click();
    await page.getByTestId('calculated-score').waitFor();
    assert.equal(await page.locator('.calculation-rows').isVisible(), true);
    await selectFeature(page, 27);
    assert.match(
      await page.getByRole('button', { name: '选择测点', exact: true }).innerText(),
      new RegExp(key),
    );
    await page.screenshot({ path: `${out}/${device}-detection.png` });
    await page.reload();
    assert.equal(
      await page.getByRole('spinbutton', { name: '片段起点' }).getAttribute('max'),
      '2565',
    );

    await page.goto(windUrl + '#/playback');
    for (const count of [1, 132, 2628]) {
      await page.getByRole('slider', { name: '播放进度' }).fill(String(count));
      await page.getByTestId('contribution-total').waitFor();
      await page.locator('.contribution-row').first().click();
      await page.getByTestId('sensor-mean-error').waitFor();
      const expectedCount = Math.min(count - 1, 2564) - Math.max(0, count - 64) + 1;
      assert.equal(await page.locator('.window-error-grid button').count(), expectedCount);
      await page.getByRole('button', { name: '收起明细', exact: true }).click();
    }
    assert.match(await page.getByTestId('played-count').innerText(), /2628 \/ 2628/);
    await page.getByRole('button', { name: /查看当前点计算/ }).click();
    await page.getByTestId('aggregate-equation').waitFor();
    assert.equal(await page.locator('.window-score-scroll tbody tr').count(), 1);
    await page.getByRole('button', { name: '查看28项', exact: true }).click();
    await page.locator('.coverage-calculation .score-calculation').waitFor();
    assert.equal(await page.locator('.coverage-calculation tbody tr').count(), 28);
    await page.getByRole('button', { name: /收起计算/ }).click();

    await page.screenshot({ path: `${out}/${device}-playback.png` });
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('[aria-label="播放进度"]').value) > 0,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('combobox', { name: '播放范围' }).selectOption('window');
    await page.getByRole('button', { name: '查看末尾', exact: true }).click();
    assert.match(await page.getByTestId('played-count').innerText(), /64 \/ 64/);

    await page.goto(windUrl + '#/anomalies');
    const kinds = {
      reference: '参考片段',
      uniform: '均匀值',
      peak: '峰值噪声',
      length: '长度调整',
    };
    for (const c of cases.cases) {
      if (device === 'mobile') await page.locator('.case-selection-summary').click();
      await page
        .locator('.case-methods button')
        .filter({ hasText: c.insertion === 'replace' ? '替换' : '混合' })
        .click();
      if (device === 'mobile') await page.locator('.case-selection-summary').click();
      await page.locator('.case-kinds button').filter({ hasText: kinds[c.kind] }).click();
      await page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click();
      await page.getByTestId('case-detection').waitFor();
      await page.waitForFunction(
        () => document.querySelector('.case-reconstruction')?.getAttribute('aria-busy') === 'false',
      );
      assert.equal(await page.getByTestId('case-detection').locator('.model-identity').count(), 1);
    }
    await page.screenshot({ path: `${out}/${device}-case.png` });
    await page.goto(windUrl + '#/metrics');
    await page.getByRole('heading', { name: '数据与评估说明', exact: true }).waitFor();
    assert.equal(await page.locator('.explanation-entry').count(), 15);
    assert.ok(!(await page.locator('.explanation-page').innerText()).includes('125'));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
      false,
    );
    assert.deepEqual(failed, []);
    await page.goto(windUrl + '#/');
    await page.getByRole('link', { name: '换流数据集 →', exact: true }).click();
    await page.getByRole('heading', { name: '换流设备 异常检测研究' }).waitFor();
    await page.goto(new URL('#/detection', showcaseUrl).href);
    await page.getByRole('spinbutton', { name: '片段起点' }).waitFor();
    assert.equal(
      await page.getByRole('spinbutton', { name: '片段起点' }).getAttribute('max'),
      '2334',
    );
    console.log(
      'PASS wind',
      device,
      'sources, normalization, training, 3 windows, playback edges, 8 cases, notes and dataset isolation',
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
