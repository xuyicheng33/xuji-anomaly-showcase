import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, selectFeature, featureValue } from './browser.mjs';
const base = showcaseUrl;
const out = process.env.QA_DIR || '.qa/loading';
await mkdir(out, { recursive: true });
const d = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const browser = await launchBrowser();
const summary = [],
  errors = [];
async function fresh(route, setup) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/journey/'))
      requests.push(r.url().split('/data/journey/')[1].split('?')[0]);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (setup) await setup(page);
  await page.goto(base + '#/' + route);
  await page.locator('h1:visible').waitFor();
  return { page, requests };
}
const actual = (rs) => [...new Set(rs.filter((s) => s.endsWith('.bin')))];
function only(requests, expected) {
  assert.deepEqual(actual(requests).sort(), expected.sort());
}
try {
  const home = await fresh('');
  await home.page.getByRole('link', { name: '开始查看', exact: true }).waitFor();
  assert.deepEqual(home.requests, []);
  await home.page.getByRole('link', { name: '开始查看', exact: true }).click();
  await home.page.locator('.removed-sensors').waitFor();
  assert.ok(home.requests.includes('manifest.json'));
  await home.page.close();
  summary.push({ homeDefersResearchManifest: true });
  const train = await fresh('training');
  await train.page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
  only(train.requests, [`curves-v1/${d.datasets.train.sha256}/5.bin`]);
  summary.push({ page: 'training', binaryFiles: actual(train.requests), bytes: 44744 });
  await train.page.close();
  const data = await fresh('data');
  await data.page.locator('.removed-sensors').waitFor();
  only(data.requests, []);
  await data.page.locator('.normalization-section').scrollIntoViewIfNeeded();
  await data.page.locator('.normalization-equation strong').waitFor();
  only(data.requests, [`curves-v1/${d.datasets.train.sha256}/5.bin`]);
  await data.page.getByRole('link', { name: '注 1：原始数据与处理例子', exact: true }).click();
  await data.page.getByRole('table', { name: '原始数据片段' }).waitFor();
  for (const name of ['缺失值填补', '无效记录裁剪'])
    await data.page.getByRole('button', { name, exact: true }).click();
  only(data.requests, [`curves-v1/${d.datasets.train.sha256}/5.bin`]);
  summary.push({
    page: 'data',
    initialBinaryFiles: [],
    normalizationDeferred: true,
    recordExamplesNeedNoBinaryRequests: true,
  });
  await data.page.close();
  const det = await fresh('detection');
  await det.page.locator('.reconstruction-view').waitFor();
  only(det.requests, [`curves-v1/${d.input.sha256}/mean.bin`]);
  await det.page.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
  await det.page.getByTestId('calculated-score').waitFor();
  const chunk = d.models[0].windows.chunks.find((c) => 107 >= c.start && 107 < c.start + c.count);
  only(det.requests, [
    `curves-v1/${d.input.sha256}/mean.bin`,
    ...Array.from(
      {
        length:
          Math.floor((107 + d.window - 1) / d.inputChunkRows) -
          Math.floor(107 / d.inputChunkRows) +
          1,
      },
      (_, i) =>
        `input-rows-v2/${d.input.sha256}/${(Math.floor(107 / d.inputChunkRows) + i) * d.inputChunkRows}.bin`,
    ),
    chunk.file,
  ]);
  assert.equal(await det.page.locator('.aggregate-error').count(), 0);
  await selectFeature(det.page, '4');
  await det.page.locator('#ref-window-calculation-label').waitFor();
  assert.ok(det.requests.includes(`curves-v1/${d.labelMatrix.sha256}/4.bin`));
  assert.ok(!det.requests.includes('labels.bin'));
  summary.push({
    page: 'detection',
    initialBytes: 19176,
    initialBinaryFiles: [`curves-v1/${d.input.sha256}/mean.bin`],
    singleWindowOnDemand: true,
    labelsOnDemand: true,
  });
  await det.page.close();
  const replay = await fresh('playback');
  await replay.page.locator('.reconstruction-view').waitFor();
  only(replay.requests, [
    `curves-v1/${d.input.sha256}/mean.bin`,
    `curves-v1/${d.models[0].recon.sha256}/mean.bin`,
  ]);
  await selectFeature(replay.page, '4');
  await replay.page.getByRole('button', { name: '下一处检出', exact: true }).click();
  await replay.page.waitForFunction(() => !document.querySelector('.feature-location'));
  assert.ok(!replay.requests.some((name) => name.endsWith('/errors.bin')));
  const index = d.labels.findIndex((v, i) => v && d.models[0].scores[i] > d.models[0].threshold);
  const best = d.models[0].focusFeatures[index];
  assert.equal(await featureValue(replay.page), String(best));
  summary.push({
    page: 'playback',
    initialBytes: 38352,
    initialBinaryFiles: [
      `curves-v1/${d.input.sha256}/mean.bin`,
      `curves-v1/${d.models[0].recon.sha256}/mean.bin`,
    ],
    focusNeedsNoMatrix: true,
  });
  await replay.page.close();
  for (let rep = 0; rep < 3; rep++) {
    let releaseOld;
    const gate = new Promise((r) => (releaseOld = r));
    let intercepted;
    const seen = new Promise((r) => (intercepted = r));
    const test = await fresh('playback', (p) =>
      p.route(`**/curves-v1/${d.models[0].recon.sha256}/mean.bin*`, async (route) => {
        intercepted();
        await gate;
        await route.continue();
      }),
    );
    await seen;
    await test.page.getByRole('slider', { name: '播放进度' }).fill('150');
    await test.page.getByTestId('count-tp').waitFor();
    assert.equal(await test.page.locator('.reconstruction-view').count(), 0);
    await test.page.getByRole('button', { name: 'SMST-AD', exact: true }).click();
    await test.page.locator('.reconstruction-view').waitFor();
    await test.page.evaluate(() => document.fonts.ready);
    await test.page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const path = await test.page.locator('.reconstruction-view path').nth(1).getAttribute('d');
    const response = test.page.waitForResponse((r) =>
      r.url().includes('/curves-v1/' + d.models[0].recon.sha256 + '/mean.bin'),
    );
    releaseOld();
    await response;
    await test.page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    assert.equal(
      await test.page.locator('.reconstruction-view path').nth(1).getAttribute('d'),
      path,
    );
    assert.equal(await test.page.getByRole('slider', { name: '播放进度' }).inputValue(), '150');
    await test.page.close();
  }
  summary.push({
    slowOldModelCannotOverwriteNewModel: 3,
    scoreAvailableBeforeReconstruction: true,
  });
  const fail = await fresh('playback', (p) =>
    p.route(`**/curves-v1/${d.models[0].recon.sha256}/mean.bin*`, (r) =>
      r.fulfill({ status: 503, body: 'failed' }),
    ),
  );
  await fail.page.getByRole('button', { name: '重试曲线' }).waitFor();
  await fail.page.getByRole('slider', { name: '播放进度' }).fill('500');
  await fail.page.unroute(`**/curves-v1/${d.models[0].recon.sha256}/mean.bin*`);
  await fail.page.getByRole('button', { name: '重试曲线' }).click();
  await fail.page.locator('.reconstruction-view').waitFor();
  assert.equal(await fail.page.getByRole('slider', { name: '播放进度' }).inputValue(), '500');
  await fail.page.close();
  const route = await fresh('training', (p) =>
    p.route(`**/curves-v1/${d.datasets.train.sha256}/5.bin*`, (r) =>
      r.fulfill({ status: 503, body: 'failed' }),
    ),
  );
  await route.page.getByRole('alert').waitFor();
  await route.page.goto(base + '#/playback');
  await route.page.getByRole('img', { name: '整体异常分数', exact: true }).waitFor();
  assert.equal(await route.page.getByRole('alert').count(), 0);
  await route.page.close();
  summary.push({ curveRetryPreservesProgress: true, pageFailureIsIsolated: true });
  for (const width of [1440, 390]) {
    for (let repetition = 0; repetition < 3; repetition++) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      await page.route('**/anomaly-cases-v1/*model2.bin*', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(base + '#/anomalies');
      await page.locator('.case-stage').waitFor();
      await page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click();
      await page.locator('.case-reconstruction[aria-busy=false]').waitFor();
      await page.locator('.case-label-cells button').nth(31).click({ force: true });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.getByRole('button', { name: 'SMST-AD', exact: true }).scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => ({
        y: scrollY,
        height: document.documentElement.scrollHeight,
      }));
      await page.getByRole('button', { name: 'SMST-AD', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '正在读取模型重建' }).waitFor();
      assert.equal(await page.locator('.case-stage').count(), 1);
      assert.equal(await page.getByTestId('case-label').innerText(), '1');
      assert.match(
        await page.locator('.case-label-cells [aria-pressed=true]').getAttribute('aria-label'),
        /^第 32 点/,
      );
      assert.deepEqual(
        await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight })),
        before,
      );
      const response = page.waitForResponse((r) =>
        r.url().includes('replace-reference-model2.bin'),
      );
      release();
      await response;
      await page.locator('.case-reconstruction[aria-busy=false]').waitFor();
      assert.deepEqual(
        await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight })),
        before,
      );
      await page.close();
    }
  }
  const caseFailure = await fresh('anomalies', (page) =>
    page.route('**/anomaly-cases-v1/*model1.bin*', (route) =>
      route.fulfill({ status: 503, body: 'failed' }),
    ),
  );
  await caseFailure.page.locator('.case-stage').waitFor();
  await caseFailure.page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click();
  await caseFailure.page.getByRole('button', { name: '重试重建', exact: true }).waitFor();
  await caseFailure.page.locator('.case-label-cells button').nth(31).click({ force: true });
  await caseFailure.page.unroute('**/anomaly-cases-v1/*model1.bin*');
  await caseFailure.page.getByRole('button', { name: '重试重建', exact: true }).click();
  await caseFailure.page.locator('.case-reconstruction[aria-busy=false]').waitFor();
  assert.match(
    await caseFailure.page
      .locator('.case-label-cells [aria-pressed=true]')
      .getAttribute('aria-label'),
    /^第 32 点/,
  );
  await caseFailure.page.close();
  summary.push({
    caseModelSwitchKeepsLayoutAndSelection: '1440px and 390px × 3',
    caseReconstructionRetry: true,
  });
  const corrupt = await fresh('training', (page) =>
    page.route('**/curves-v1/**/*.bin*', async (route) => {
      const file = new URL(route.request().url()).pathname.split('/data/journey/')[1];
      const raw = Buffer.from(await readFile('public/data/journey/' + file));
      raw[0] ^= 1;
      await route.fulfill({ body: raw, contentType: 'application/octet-stream' });
    }),
  );
  await corrupt.page.getByRole('alert').filter({ hasText: '数据文件不匹配' }).waitFor();
  await corrupt.page.unroute('**/curves-v1/**/*.bin*');
  await corrupt.page.getByRole('button', { name: '重新读取', exact: true }).click();
  await corrupt.page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
  await corrupt.page.close();
  summary.push({ equalLengthCurveCorruptionRejectedAndRetryable: true });
  assert.deepEqual(errors, []);
  await writeFile(out + '/loading-checks.json', JSON.stringify({ summary, errors }, null, 2));
  console.log(
    'PASS per-page binary requests, deferred training/labels and indexed feature location, score before curves, model request isolation x3 and failure recovery',
  );
} finally {
  await browser.close();
}
