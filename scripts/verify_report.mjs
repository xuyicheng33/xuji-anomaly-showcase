import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';
const base = showcaseUrl;
const data = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const cases = JSON.parse(
  await readFile('public/data/journey/anomaly-cases-v1/manifest.json', 'utf8'),
).cases;
const browser = await launchBrowser();
const errors = [];
const out = process.env.QA_DIR || '.qa/report';
await mkdir(out, { recursive: true });
async function go(page, name) {
  await page.goto(base + '#/' + name);
  await page.locator('h1:visible').waitFor();
  if (name === 'data') {
    await page.locator('.normalization-section').scrollIntoViewIfNeeded();
    await page.locator('.normalization-equation strong').waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  if (['anomalies', 'training', 'detection', 'playback'].includes(name))
    await page.locator('.curve').first().waitFor();
  if (name === 'playback') await page.locator('.reconstruction-view').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
function expected(m, from, to, th = m.threshold) {
  const v = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (let i = from; i < to; i++)
    v[data.labels[i] ? (m.scores[i] > th ? 'tp' : 'fn') : m.scores[i] > th ? 'fp' : 'tn']++;
  return v;
}
async function matrix(page, m) {
  for (const [key, value] of Object.entries(m))
    await page.waitForFunction(
      ({ key, value }) =>
        document.querySelector('[data-testid=count-' + key + '] strong')?.textContent ===
        String(value),
      { key, value },
    );
}
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const name of [
      '',
      'data',
      'anomalies',
      'models',
      'training',
      'detection',
      'playback',
      'metrics',
    ]) {
      await go(page, name);
      if (name === 'anomalies')
        await page.getByRole('button', { name: '播放构造', exact: true }).click();
      if (name === 'detection') {
        await page.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
        await page.getByTestId('calculated-score').waitFor();
      }
      if (name === 'playback') await page.getByRole('slider', { name: '播放进度' }).fill('150');
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        name + ' overflow ' + width,
      );
      assert.equal(
        await page
          .locator('svg path')
          .evaluateAll((es) => es.some((e) => /NaN|Infinity/.test(e.getAttribute('d') || ''))),
        false,
      );
      assert.equal(
        await page
          .locator('body')
          .innerText()
          .then((s) =>
            /STMem-AD|归档阈值|训练POT|报告描述|尚待|另行核定|并不代表|是不是|这不意味着|并非/.test(
              s,
            ),
          ),
        false,
        'stale experimental copy visible',
      );
      await page.screenshot({
        path: out + '/' + width + '-' + (name || 'home') + '.png',
        fullPage: true,
      });
      if (width === 1440 && name === 'playback') {
        const box = await page.locator('.confusion').boundingBox();
        assert.ok(box.y + box.height <= 900, 'matrix below screen ' + (box.y + box.height));
      }
    }
    await page.close();
    console.log('PASS 8 pages ' + width + 'px');
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await go(page, 'anomalies');
  const kindNames = {
    reference: '参考片段',
    uniform: '均匀值',
    peak: '峰值噪声',
    length: '长度调整',
  };
  const values = async (asset) => {
    const buf = await readFile('public/data/journey/' + asset.file);
    return new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  };
  for (const item of cases) {
    await page
      .locator('.case-methods button')
      .filter({
        has: page.locator('strong', { hasText: item.insertion === 'replace' ? '替换' : '混合' }),
      })
      .click();
    await page.locator('.case-kinds button').filter({ hasText: kindNames[item.kind] }).click();
    await page.locator('.case-stage[data-case="' + item.id + '"]').waitFor();
    await page.getByRole('button', { name: '标签结果', exact: true }).click();
    const input = await values(item.input),
      labelValues = await values(item.labels);
    assert.equal(
      await page.getByTestId('case-after').innerText(),
      input[30 * 125 + item.feature].toFixed(4),
    );
    assert.equal(
      await page.getByTestId('case-label').innerText(),
      String(labelValues[30 * 125 + item.feature]),
    );
    assert.equal(
      await page.locator('.case-label-cells .marked').count(),
      item.kind === 'peak' ? 9 : 24,
    );
    await page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click();
    for (const cm of item.models) {
      await page.getByRole('button', { name: cm.name, exact: true }).click();
      await page.getByTestId('case-score').waitFor();
      await page.waitForFunction(
        (expected) => document.querySelector('[data-testid=case-score]')?.textContent === expected,
        cm.scores[30].toFixed(6),
      );
      await matrix(
        page,
        Object.fromEntries(['tp', 'fp', 'fn', 'tn'].map((k) => [k, cm.metrics[k]])),
      );
    }
    await page.getByRole('button', { name: '原始片段', exact: true }).click();
    assert.equal(await page.locator('.case-label-cells .marked').count(), 0);
    const original = await values(item.original);
    assert.equal(
      await page.getByTestId('case-after').innerText(),
      original[30 * 125 + item.feature].toFixed(4),
    );
  }
  console.log(
    'PASS 8 fixed cases x 2 model outputs; construction, labels, exact scores and confusion counts',
  );
  await go(page, 'detection');
  for (const model of data.models) {
    await page.getByRole('button', { name: model.name, exact: true }).click();
    for (const start of [0, 107, 2333]) {
      await page.getByRole('spinbutton', { name: '片段起点' }).fill(String(start + 1));
      await page.getByRole('button', { name: /查看模型结果|重新查看结果/ }).click();
      await page.getByTestId('calculated-score').waitFor();
      const chunk = model.windows.chunks.find((c) => start >= c.start && start < c.start + c.count),
        buffer = await readFile('public/data/journey/' + chunk.file),
        pred = new Float32Array(
          buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
        );
      const inputBuffer = await readFile('data/reference/input.bin'),
        input = new Float64Array(
          inputBuffer.buffer.slice(
            inputBuffer.byteOffset,
            inputBuffer.byteOffset + inputBuffer.length,
          ),
        );
      const scores = Array.from({ length: 64 }, (_, i) => {
        let sum = 0;
        for (let c = 0; c < 125; c++)
          sum +=
            (input[(start + i) * 125 + c] - pred[((start - chunk.start) * 64 + i) * 125 + c]) ** 2;
        return sum / 125;
      });
      for (const offset of [0, 31, 63]) {
        await page.getByRole('slider', { name: '片段查看时刻' }).fill(String(offset));
        assert.equal(
          await page.getByTestId('calculated-score').innerText(),
          scores[offset].toFixed(9),
        );
      }
      assert.equal(
        await page.getByTestId('window-threshold').innerText(),
        model.windowThreshold.toFixed(6),
      );
      const stats = { tp: 0, fp: 0, fn: 0, tn: 0 };
      scores.forEach(
        (v, i) =>
          stats[
            data.labels[start + i]
              ? v > model.windowThreshold
                ? 'tp'
                : 'fn'
              : v > model.windowThreshold
                ? 'fp'
                : 'tn'
          ]++,
      );
      await matrix(page, stats);
    }
  }
  console.log(
    'PASS true windows first/middle/last, 125-feature score calculation and window threshold',
  );
  const exampleNames = { tp: '检出片段', fp: '误报片段', fn: '漏检片段', tn: '正常片段' };
  const outcomes = { tp: '检出异常', fp: '误报', fn: '漏检异常', tn: '正常' };
  for (const model of data.models) {
    await page.getByRole('button', { name: model.name, exact: true }).click();
    for (const example of model.examples) {
      await page.getByRole('button', { name: exampleNames[example.code], exact: true }).click();
      await page.getByRole('button', { name: /查看模型结果|重新查看结果/ }).click();
      await page.getByTestId('calculated-score').waitFor();
      assert.equal(
        await page.locator('#window-calculation').getAttribute('data-point'),
        String(example.index + 1),
      );
      assert.equal(
        await page.locator('.calculation-total .outcome').innerText(),
        outcomes[example.code],
      );
    }
  }
  console.log('PASS all typical examples select a matching single-window outcome');
  await go(page, 'playback');
  for (const model of data.models) {
    await page.getByRole('button', { name: model.name, exact: true }).click();
    for (const n of [0, 1, 7, 640, 2397]) {
      await page.getByRole('slider', { name: '播放进度' }).fill(String(n));
      await matrix(page, expected(model, 0, n));
    }
  }
  await page.getByRole('combobox', { name: '选择测点' }).selectOption('-1');
  assert.equal(await page.locator('.aggregate-error').count(), 0);
  const retainedProgress = await page.getByRole('slider', { name: '播放进度' }).inputValue();
  await page.getByRole('combobox', { name: '选择测点' }).selectOption('4');
  assert.equal(await page.locator('.aggregate-error').count(), 0);
  assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), retainedProgress);
  await page.getByRole('combobox', { name: '选择测点' }).selectOption('-1');
  for (let rep = 0; rep < 3; rep++) {
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.getByRole('combobox', { name: '播放速度' }).selectOption('16');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('[aria-label=播放进度]').value) >= 3,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const n = await page.getByRole('slider', { name: '播放进度' }).inputValue();
    await page.waitForTimeout(180);
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), n);
    await page.getByRole('slider', { name: '播放进度' }).fill('2395');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '重新播放', exact: true }).waitFor();
    await matrix(page, expected(data.models[1], 0, 2397));
  }
  await page.getByRole('slider', { name: '播放进度' }).fill('640');
  await page.getByRole('button', { name: data.models[0].name, exact: true }).click();
  await matrix(page, expected(data.models[0], 0, 640));
  assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '640');
  console.log('PASS playback prefixes, model switches, pause/end x3');
  await go(page, 'metrics');
  await page.getByRole('button', { name: '单点检出', exact: true }).click();
  assert.equal(await page.getByTestId('pw-tp').innerText(), '1');
  assert.equal(await page.getByTestId('pa-tp').innerText(), '8');
  assert.equal(await page.getByTestId('pw-f1').innerText(), '22.22%');
  assert.equal(await page.getByTestId('pa-f1').innerText(), '100.00%');
  console.log('PASS interactive point-wise vs point-adjusted example');
  await page.evaluate(() => (document.documentElement.style.zoom = '2'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: out + '/zoom200-metrics.png', fullPage: true });
  await page.close();
  const failPage = await browser.newPage();
  let fail = true;
  await failPage.route('**/windows-v1/model1/windows-0096.bin*', (r) =>
    fail ? r.fulfill({ status: 503, body: 'failed' }) : r.continue(),
  );
  await go(failPage, 'detection');
  await failPage.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
  await failPage.getByRole('alert').waitFor();
  fail = false;
  await failPage.getByRole('button', { name: '重试', exact: true }).click();
  await failPage.getByTestId('calculated-score').waitFor();
  assert.equal(await failPage.getByRole('spinbutton', { name: '片段起点' }).inputValue(), '108');
  await failPage.close();
  console.log('PASS window failure/retry preserves selection');
  assert.deepEqual(errors, []);
  console.log('PASS no page errors');
} finally {
  await browser.close();
}
