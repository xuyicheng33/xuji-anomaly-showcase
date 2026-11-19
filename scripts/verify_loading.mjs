import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {
  featureValue,
  launchBrowser,
  selectFeature,
  showcaseUrl,
  typicalPoints,
  windowAround,
} from './browser.mjs';
const base = showcaseUrl;
const out = qaDirectory('loading');
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
  await home.page.getByRole('link', { name: '查看研究流程', exact: true }).waitFor();
  assert.deepEqual(home.requests, []);
  const homeScripts = await home.page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => /\/assets\/.*\.js$/.test(new URL(r.name).pathname))
      .map((r) => new URL(r.name).pathname),
  );
  assert.ok(
    homeScripts.every((name) => !/Chapter|Curve|calculationIndex|cleaning-data/.test(name)),
    homeScripts.join(', '),
  );
  await home.page.getByRole('link', { name: '查看研究流程', exact: true }).click();
  await home.page.locator('.removed-sensors').waitFor();
  assert.ok(home.requests.includes('manifest.json'));
  await home.page.close();
  summary.push({ homeDefersResearchManifest: true });
  summary.push({ homeDefersChapterCode: homeScripts });
  {
    const page = await browser.newPage();
    let releaseManifest;
    const gate = new Promise((resolve) => {
      releaseManifest = resolve;
    });
    await page.route('**/data/journey/manifest.json', async (route) => {
      await gate;
      await route.continue();
    });
    const chapter = page.waitForRequest((request) =>
      /\/TrainingChapter-[^/]+\.js$/.test(new URL(request.url()).pathname),
    );
    await page.goto(base + '#/training', { waitUntil: 'domcontentloaded' });
    try {
      await chapter;
    } finally {
      releaseManifest();
    }
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    await page.close();
    summary.push({ chapterRequestStartsBeforeManifestCompletes: true });
  }
  const train = await fresh('training');
  await train.page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
  only(train.requests, [`curves-v1/${d.datasets.train.sha256}/5.bin`]);
  assert.ok(train.requests.includes(d.datasets.train.times.file));
  summary.push({ page: 'training', binaryFiles: actual(train.requests), bytes: 44744 });
  await train.page.close();
  const data = await fresh('data');
  await data.page.locator('.removed-sensors').waitFor();
  only(data.requests, []);
  assert.ok(!data.requests.includes(d.datasets.train.times.file));
  await data.page.locator('.normalization-section').scrollIntoViewIfNeeded();
  await data.page.locator('.normalization-equation strong').waitFor();
  only(data.requests, [`curves-v1/${d.datasets.train.sha256}/5.bin`]);
  await data.page
    .getByRole('link', { name: '数据说明：原始数据与处理例子（注 1）', exact: true })
    .click();
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
  assert.ok(!det.requests.includes(d.datasets.train.times.file));
  await det.page.getByTestId('calculated-score').waitFor();
  // The page opens on the strongest detection; its window and the covering scores load with it.
  const opening = typicalPoints(d.labels, d.models[0].scores, d.models[0].threshold)[0].index;
  const first = windowAround(opening, d.window, d.times.length);
  const chunk = d.models[0].windows.chunks.find(
    (c) => first >= c.start && first < c.start + c.count,
  );
  const calculation = JSON.parse(
    await readFile('public/data/journey/' + d.calculation.file, 'utf8'),
  );
  const scoreChunk = calculation.models[d.models[0].id].chunks.find(
    (c) => opening >= c.start && opening < c.start + c.count,
  );
  await det.page.getByTestId('aggregate-equation').waitFor();
  only(det.requests, [
    `curves-v1/${d.input.sha256}/mean.bin`,
    ...Array.from(
      {
        length:
          Math.floor((first + d.window - 1) / d.inputChunkRows) -
          Math.floor(first / d.inputChunkRows) +
          1,
      },
      (_, i) =>
        `input-rows-v2/${d.input.sha256}/${(Math.floor(first / d.inputChunkRows) + i) * d.inputChunkRows}.bin`,
    ),
    chunk.file,
    chunk.integrity.file,
    scoreChunk.file,
  ]);
  assert.equal(await det.page.locator('.aggregate-error').count(), 0);
  await selectFeature(det.page, '4');
  await det.page.locator('#ref-window-calculation-label').waitFor();
  assert.ok(det.requests.includes(`curves-v1/${d.labelMatrix.sha256}/4.bin`));
  assert.ok(!det.requests.includes('labels.bin'));
  summary.push({
    page: 'detection',
    initialBytes: 19176,
    initialBinaryFiles: [
      `curves-v1/${d.input.sha256}/mean.bin`,
      'selected window',
      'covering window scores',
    ],
    singleWindowLoadedWithPage: true,
    labelsOnDemand: true,
  });
  await det.page.close();
  const replay = await fresh('playback');
  await replay.page.locator('.playback-page[data-curves-ready=true]').waitFor();
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
  const deferredCase = await fresh('anomalies');
  await deferredCase.page.locator('.case-stage').waitFor();
  assert.ok(!deferredCase.requests.some((file) => /model[12]\.bin$/.test(file)));
  await deferredCase.page.getByRole('button', { name: '查看该片段检测', exact: true }).click();
  await deferredCase.page.locator('.case-reconstruction[aria-busy=false]').waitFor();
  assert.ok(deferredCase.requests.some((file) => /model1\.bin$/.test(file)));
  await deferredCase.page.close();
  summary.push({ caseReconstructionDeferredUntilOpened: true });
  {
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
    slowOldModelCannotOverwriteNewModel: true,
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
  await route.page.getByRole('button', { name: '单步', exact: true }).click();
  await route.page.getByRole('img', { name: '整体异常分数', exact: true }).waitFor();
  assert.equal(await route.page.getByRole('alert').count(), 0);
  await route.page.close();
  summary.push({ curveRetryPreservesProgress: true, pageFailureIsIsolated: true });
  for (const width of [1440, 390]) {
    {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      await page.route('**/anomaly-cases-v1/**/*model2.bin*', async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(base + '#/anomalies');
      await page.locator('.case-stage').waitFor();
      await page.getByRole('button', { name: '查看该片段检测', exact: true }).click();
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
    page.route('**/anomaly-cases-v1/**/*model1.bin*', (route) =>
      route.fulfill({ status: 503, body: 'failed' }),
    ),
  );
  await caseFailure.page.locator('.case-stage').waitFor();
  await caseFailure.page.getByRole('button', { name: '查看该片段检测', exact: true }).click();
  await caseFailure.page.getByRole('button', { name: '重试重建', exact: true }).waitFor();
  await caseFailure.page.locator('.case-label-cells button').nth(31).click({ force: true });
  await caseFailure.page.unroute('**/anomaly-cases-v1/**/*model1.bin*');
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
    caseModelSwitchKeepsLayoutAndSelection: '1440px and 390px',
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
  for (const dataset of ['converter', 'wind']) {
    const folder = dataset === 'wind' ? 'wind' : 'journey';
    const manifest = JSON.parse(await readFile(`public/data/${folder}/manifest.json`, 'utf8'));
    const original = await readFile(`public/data/${folder}/${manifest.cases.file}`, 'utf8');
    for (const field of ['threshold', 'scores', 'tp']) {
      const pattern = new RegExp(`("${field}":\\s*(?:\\[\\s*)?)([0-9])`);
      const changed = original.replace(
        pattern,
        (_, prefix, digit) => prefix + ((Number(digit) + 1) % 10),
      );
      assert.notEqual(changed, original);
      assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      page.on('pageerror', (e) => errors.push(String(e)));
      let reads = 0;
      await page.route('**/anomaly-cases-v1/**/manifest.json*', (route) => {
        reads++;
        return route.fulfill({
          body: reads === 1 ? changed : original,
          contentType: 'application/json',
        });
      });
      const url = new URL(base);
      url.searchParams.set('dataset', dataset);
      url.hash = '/anomalies';
      await page.goto(url.href);
      await page.getByRole('alert').filter({ hasText: '数据文件不匹配' }).waitFor();
      assert.equal(await page.locator('.case-stage').count(), 0);
      await page.getByRole('button', { name: '重新读取案例', exact: true }).click();
      await page.locator('.case-stage').waitFor();
      await page.getByRole('button', { name: '查看该片段检测', exact: true }).click();
      await page.locator('.case-reconstruction[aria-busy=false]').waitFor();
      assert.equal(reads, 2);
      await page.close();
    }
  }
  summary.push({ changedCaseThresholdScoresAndCountsRejectedAndRetryable: 'both datasets' });
  for (const dataset of ['converter', 'wind']) {
    const folder = dataset === 'wind' ? 'wind' : 'journey';
    const manifest = JSON.parse(await readFile(`public/data/${folder}/manifest.json`, 'utf8'));
    const original = await readFile(`public/data/${folder}/${manifest.calculation.file}`, 'utf8');
    const url = new URL(base);
    url.searchParams.set('dataset', dataset);
    url.hash = '/playback';
    const missing = structuredClone(manifest);
    missing.models[0].contributions.chunks = [];
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    let reads = 0;
    await page.route(`**/data/${folder}/manifest.json`, (route) =>
      route.fulfill({ json: ++reads === 1 ? missing : manifest }),
    );
    await page.goto(url.href);
    await page.getByRole('alert').filter({ hasText: '资料版本不匹配' }).waitFor();
    await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.getByRole('slider', { name: '播放进度' }).fill('133');
    await page.getByTestId('contribution-total').waitFor();
    assert.equal(reads, 2);
    let indexReads = 0;
    const changed = JSON.parse(original);
    const id = manifest.models[0].id;
    if (manifest.models.length > 1) changed.models[id] = changed.models[manifest.models[1].id];
    else delete changed.models[id];
    await page.route('**/calculation-v2/**/manifest.json*', (route) =>
      route.fulfill({
        body: ++indexReads === 1 ? JSON.stringify(changed) : original,
        contentType: 'application/json',
      }),
    );
    await page.getByRole('link', { name: /计算过程/ }).click();
    await page.getByRole('alert').filter({ hasText: '数据文件' }).waitFor();
    assert.equal(await page.getByTestId('aggregate-equation').count(), 0);
    await page.getByRole('button', { name: '重试计算索引', exact: true }).click();
    await page.getByTestId('aggregate-equation').waitFor();
    assert.equal(indexReads, 2);
    assert.equal(await page.locator('#window-calculation').getAttribute('data-point'), '133');
    assert.equal(
      await page.getByTestId('aggregate-equation').locator('strong').innerText(),
      manifest.models[0].scores[132].toFixed(9),
    );
    await page.close();
  }
  summary.push({
    missingContributionsAndChangedCalculationModelRejectedAndRetryable: 'both datasets',
  });
  assert.deepEqual(errors, []);
  await writeFile(out + '/loading-checks.json', JSON.stringify({ summary, errors }, null, 2));
  console.log(
    'PASS per-page binary requests, deferred training/labels and indexed feature location, score before curves, model request isolation and failure recovery',
  );
} finally {
  await browser.close();
}
