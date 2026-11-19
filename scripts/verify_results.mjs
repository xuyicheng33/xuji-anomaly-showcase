import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, qaDirectory } from './browser.mjs';

const out = qaDirectory('results');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const errors = [],
  checks = [];
const kinds = { reference: '参考片段', uniform: '均匀值', peak: '峰值噪声', length: '长度调整' };
const json = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const url = (dataset, chapter) => {
  const target = new URL(showcaseUrl);
  target.search = dataset === 'wind' ? '?dataset=wind' : '';
  target.hash = '#/' + chapter;
  return target.href;
};

async function navigate(page, chapter) {
  const menu = page.getByRole('button', { name: '目录', exact: true });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== 'true')
    await menu.click();
  await page.locator(`.site-nav a[href="#/${chapter}"]`).click();
  const target = {
    models: '.models-chapter',
    training: '.training-chapter',
    detection: '.detection-page',
    playback: '.playback-page',
    anomalies: '.case-page',
    metrics: '.explanation-page',
  }[chapter];
  await page.locator(target + ':visible').waitFor();
}

async function exactText(page, selector, value) {
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.textContent === value,
    { selector, value },
  );
}

async function checkDetection(page, root, data, start) {
  const model = data.models[0],
    features = data.features.length;
  await page.getByRole('spinbutton', { name: '片段起点' }).fill(String(start + 1));
  await page.getByTestId('calculated-score').waitFor();
  const point = Number(await page.locator('#window-calculation').getAttribute('data-point')) - 1;
  assert.ok(point >= start && point < start + data.window);
  const chunk = model.windows.chunks.find((c) => start >= c.start && start < c.start + c.count);
  const predictions = await readFile(root + '/' + chunk.file);
  const inputStart = Math.floor(point / data.inputChunkRows) * data.inputChunkRows;
  const inputs = await readFile(`${root}/input-rows-v2/${data.input.sha256}/${inputStart}.bin`);
  let score = 0;
  for (let feature = 0; feature < features; feature++) {
    const input = inputs.readDoubleLE(((point - inputStart) * features + feature) * 8);
    const prediction = predictions.readFloatLE(
      ((start - chunk.start) * data.window + point - start) * features * 4 + feature * 4,
    );
    const error = (input - prediction) ** 2;
    score += error;
    if (feature === features - 1) {
      const row = await page.locator('#window-calculation tbody tr').nth(feature).innerText();
      for (const value of [input, prediction, error])
        assert.ok(row.includes(value.toFixed(9)), row);
    }
  }
  assert.equal(await page.locator('#window-calculation tbody tr').count(), features);
  assert.equal(
    await page.getByTestId('calculated-score').innerText(),
    (score / features).toFixed(9),
  );
}

async function checkPlayback(page, root, data, index) {
  const model = data.models[0],
    features = data.features.length;
  await page.getByRole('slider', { name: '播放进度' }).fill(String(index + 1));
  await exactText(page, '[data-testid="contribution-total"]', model.scores[index].toFixed(9));
  const first = Math.max(0, index - data.window + 1),
    last = Math.min(index, data.times.length - data.window);
  await page.locator('.contribution-row').first().click();
  await page.getByTestId('sensor-mean-error').waitFor();
  assert.equal(await page.locator('.window-error-grid button').count(), last - first + 1);
  const chunk = model.contributions.chunks.find(
    (c) => index >= c.start && index < c.start + c.count,
  );
  const values = await readFile(root + '/' + chunk.file);
  const row = Array.from({ length: features }, (_, feature) =>
    values.readDoubleLE(((index - chunk.start) * features + feature) * 8),
  );
  const feature = row.indexOf(Math.max(...row));
  assert.equal(await page.getByTestId('sensor-mean-error').innerText(), row[feature].toFixed(9));
  await page.locator('.window-error-grid button').last().click();
  const predictionChunk = model.windows.chunks.find(
    (c) => last >= c.start && last < c.start + c.count,
  );
  const predictions = await readFile(root + '/' + predictionChunk.file);
  const prediction = predictions.readFloatLE(
    (((last - predictionChunk.start) * data.window + index - last) * features + feature) * 4,
  );
  const inputStart = Math.floor(index / data.inputChunkRows) * data.inputChunkRows;
  const inputs = await readFile(`${root}/input-rows-v2/${data.input.sha256}/${inputStart}.bin`);
  const input = inputs.readDoubleLE(((index - inputStart) * features + feature) * 8);
  assert.equal(await page.getByTestId('sensor-window-input').innerText(), input.toFixed(9));
  assert.equal(
    await page.getByTestId('sensor-window-prediction').innerText(),
    prediction.toFixed(9),
  );
  assert.equal(
    await page.getByTestId('sensor-window-error').innerText(),
    ((input - prediction) ** 2).toFixed(9),
  );
  await page.getByRole('button', { name: '收起明细', exact: true }).click();
  await page.getByRole('button', { name: /查看当前点计算/ }).click();
  await page.getByTestId('aggregate-equation').waitFor();
  assert.equal(await page.locator('.window-score-scroll tbody tr').count(), last - first + 1);
  assert.equal(
    await page.getByTestId('aggregate-equation').locator('strong').innerText(),
    model.scores[index].toFixed(9),
  );
  await page
    .getByRole('button', { name: `查看 ${features} 项`, exact: true })
    .first()
    .click();
  await page.getByTestId('coverage-window-calculation-score').waitFor();
  assert.equal(await page.locator('.coverage-calculation tbody tr').count(), features);
  await page.getByRole('button', { name: /收起计算/ }).click();
}

try {
  for (const width of [1440, 390])
    for (const dataset of ['converter', 'wind']) {
      const root = 'public/data/' + (dataset === 'wind' ? 'wind' : 'journey');
      const catalog = await json(root + '/results.json');
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(url(dataset, ''));
      await page.locator('.home-hero').waitFor();
      assert.equal(await page.getByRole('link', { name: /查看原版结果/ }).count(), 0);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${out}/${dataset}-home-${width}.png` });
      await navigate(page, 'models');
      await page.locator('.model-architecture').waitFor();
      assert.equal(
        await page.locator('.model-select button[aria-pressed=true]').innerText(),
        'STAM-AD',
      );
      for (const method of catalog.methods) {
        const data = await json(root + '/' + method.manifest.file);
        await navigate(page, 'models');
        await page.getByRole('button', { name: method.name, exact: true }).click();
        await page
          .locator('.model-select button[aria-pressed=true]')
          .filter({ hasText: method.name })
          .waitFor();
        const input = page.locator('[data-node=input]');
        if ((await input.getAttribute('aria-pressed')) !== 'true') await input.click();
        assert.ok(
          (await page.locator('.model-panel').innerText()).includes(
            `每个窗口 ${data.window} 个时刻、${data.features.length} 个测点`,
          ),
        );
        assert.equal(
          await page
            .locator(method.id === 'model2' ? '[data-node=senc]' : '[data-node=ltcn]')
            .count(),
          1,
        );
        await page.screenshot({ path: `${out}/${dataset}-${method.id}-models-${width}.png` });
        const requests = [];
        const record = (request) => requests.push(request.url());
        page.on('request', record);
        await navigate(page, 'training');
        await page.getByRole('slider', { name: '训练窗口位置' }).waitFor();
        assert.equal(
          await page.getByRole('slider', { name: '训练轮次' }).getAttribute('max'),
          String(method.epochs - 1),
        );
        await page.getByRole('slider', { name: '训练窗口位置' }).fill('0');
        await page.getByRole('button', { name: '末个窗口', exact: true }).click();
        assert.equal(
          await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(),
          String(data.datasets.train.shape[0] - data.window),
        );
        assert.ok(
          requests.some((request) => request.includes(data.datasets.normalizedTrain.sha256)) ||
            (await page.evaluate(
              (hash) =>
                performance.getEntriesByType('resource').some((entry) => entry.name.includes(hash)),
              data.datasets.normalizedTrain.sha256,
            )),
        );
        page.off('request', record);
        await navigate(page, 'detection');
        assert.equal(
          await page.getByRole('spinbutton', { name: '片段起点' }).getAttribute('max'),
          String(data.times.length - data.window + 1),
        );
        for (const start of [
          0,
          Math.floor((data.times.length - data.window) / 2),
          data.times.length - data.window,
        ])
          await checkDetection(page, root, data, start);
        await page.screenshot({ path: `${out}/${dataset}-${method.id}-detection-${width}.png` });
        await navigate(page, 'playback');
        for (const index of [0, 131, data.times.length - 1])
          await checkPlayback(page, root, data, index);
        await page.getByRole('combobox', { name: '播放范围' }).selectOption('window');
        await page.getByRole('button', { name: '查看末尾', exact: true }).click();
        assert.equal(
          await page.getByRole('slider', { name: '播放进度' }).getAttribute('max'),
          String(data.window),
        );
        await page.getByRole('combobox', { name: '播放范围' }).selectOption('all');
        await page.getByRole('button', { name: '重置', exact: true }).click();
        await page.getByRole('button', { name: '播放', exact: true }).click();
        await page.waitForFunction(
          () => Number(document.querySelector('[aria-label="播放进度"]')?.value) > 0,
        );
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        await page.screenshot({ path: `${out}/${dataset}-${method.id}-playback-${width}.png` });
        await navigate(page, 'anomalies');
        const cases = await json(root + '/' + data.cases.file);
        for (const example of cases.cases) {
          if (width < 1050) await page.locator('.case-selection-summary').click();
          await page
            .locator('.case-methods button')
            .filter({ hasText: example.insertion === 'replace' ? '替换' : '混合' })
            .click();
          if (width < 1050) await page.locator('.case-selection-summary').click();
          await page.locator('.case-kinds button').filter({ hasText: kinds[example.kind] }).click();
          await page.locator(`.case-stage[data-case="${example.id}"]`).waitFor();
          await page.getByRole('button', { name: '查看该片段检测', exact: true }).click();
          await page.waitForFunction(
            () =>
              document.querySelector('.case-reconstruction')?.getAttribute('aria-busy') === 'false',
          );
          assert.equal(
            await page.getByRole('slider', { name: '案例查看时刻' }).getAttribute('max'),
            String(data.window - 1),
          );
          const result = example.models[0];
          for (const key of ['tp', 'fp', 'fn', 'tn'])
            assert.equal(
              await page
                .getByTestId('case-detection')
                .getByTestId('count-' + key)
                .locator('strong')
                .innerText(),
              String(result.metrics[key]),
            );
          if (example.kind === 'length') {
            assert.equal(
              await page.locator('.length-source button').count(),
              (example.end - example.begin) / example.source.scale,
            );
            assert.equal(
              await page.locator('.length-destination button').count(),
              example.end - example.begin,
            );
          }
        }
        await page.screenshot({ path: `${out}/${dataset}-${method.id}-cases-${width}.png` });
        await navigate(page, 'metrics');
        assert.equal(await page.locator('.explanation-entry').count(), 15);
        assert.equal(await page.locator('.metrics-archive tbody').count(), 2);
        assert.match(
          await page.locator('#note-window-settings').innerText(),
          new RegExp(String(data.window)),
        );
        assert.equal(await page.getByRole('link', { name: /查看原版结果/ }).count(), 0);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        checks.push({
          dataset,
          method: method.id,
          width,
          windows: data.models[0].windows.count,
          cases: cases.cases.length,
        });
        console.log(
          'PASS new result',
          dataset,
          method.id,
          width,
          'training, windows, playback arithmetic, cases and notes',
        );
      }
      assert.equal(await page.getByRole('link', { name: /查看原版结果/ }).count(), 0);
      await navigate(page, 'models');
      await page.locator('.model-architecture').waitFor();
      assert.equal(new URL(page.url()).searchParams.has('version'), false);
      // The model chosen in the last round stays selected across chapters.
      assert.equal(
        await page.locator('.model-select button[aria-pressed=true]').innerText(),
        catalog.methods.at(-1).name,
      );
      await page.close();
    }
  for (const dataset of ['converter', 'wind']) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 900 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url(dataset, 'models'));
    await page.locator('.model-architecture').waitFor();
    for (const method of ['STAM-AD', 'SMST-AD']) {
      await page.getByRole('button', { name: method, exact: true }).click();
      await page
        .locator('.model-select button[aria-pressed=true]')
        .filter({ hasText: method })
        .waitFor();
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/${dataset}-${method}-320-zoom.png` });
      await page.evaluate(() => (document.documentElement.style.zoom = '1'));
    }
    await navigate(page, 'metrics');
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + '\n');
} finally {
  await browser.close();
}
