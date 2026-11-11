import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';

const base = showcaseUrl;
const build = JSON.parse(await readFile('.qa/build.json', 'utf8'));
const output = process.env.QA_DIR || '.qa/deployment/browser';
await mkdir(output, { recursive: true });
const digest = (raw) => createHash('sha256').update(raw).digest('hex');
async function matchesRelease(file) {
  const response = await fetch(new URL(file, base));
  assert.ok(response.ok, `Released file unavailable: ${file}`);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), build.files[file], file);
}
await matchesRelease('index.html');
await Promise.all(
  Object.keys(build.files)
    .filter((file) => file.startsWith('assets/'))
    .map(matchesRelease),
);
const datasets = await Promise.all(
  ['journey', 'wind'].map(async (folder) => {
    await matchesRelease(`data/${folder}/manifest.json`);
    await matchesRelease(`data/${folder}/evaluation.json`);
    const data = JSON.parse(await readFile(`dist/data/${folder}/manifest.json`, 'utf8'));
    await matchesRelease(`data/${folder}/${data.calculation.file}`);
    await matchesRelease(`data/${folder}/${data.datasets.train.times.file}`);
    return data;
  }),
);
const browser = await launchBrowser();
const checks = [];
try {
  for (const data of datasets) {
    const wind = data.dataset.id === 'wind';
    const home = new URL(wind ? '?dataset=wind' : '.', base).href;
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        const url = new URL(response.url());
        const file = url.pathname.replace(new URL(base).pathname, '');
        if (response.status() >= 400) errors.push(`${response.status()} ${file}`);
      });
      await page.goto(home + '#/');
      await page.getByRole('link', { name: '开始查看', exact: true }).click();
      await page.locator('.normalization-section').scrollIntoViewIfNeeded();
      await page.locator('.normalization-equation strong').waitFor();
      await page.goto(home + '#/anomalies');
      await page.locator('.case-stage').waitFor();
      await page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click();
      await page.locator('.case-reconstruction[aria-busy=false]').waitFor();
      await page.goto(home + '#/training');
      await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
      await page.getByRole('button', { name: '末个窗口', exact: true }).click();
      assert.equal(
        await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(),
        String(data.datasets.train.shape[0] - data.window),
      );
      await page.goto(home + '#/detection');
      await page.getByRole('spinbutton', { name: '片段起点' }).fill('1');
      await page.getByRole('button', { name: /查看模型结果/ }).click();
      await page.getByTestId('calculated-score').waitFor();
      assert.equal(await page.locator('.score-calculation tbody tr').count(), data.features.length);
      await page.screenshot({ path: `${output}/${data.dataset.id}-${width}-detection.png` });
      await page.goto(home + '#/playback');
      await page.getByRole('slider', { name: '播放进度' }).fill('133');
      await page.getByRole('button', { name: '查看当前点计算', exact: false }).click();
      await page.getByTestId('aggregate-equation').waitFor();
      assert.equal(
        await page.getByTestId('aggregate-equation').locator('strong').innerText(),
        data.models[0].scores[132].toFixed(9),
      );
      await page.locator('#ref-playback-window-aggregation').click();
      await page.locator('#note-window-aggregation:focus').waitFor();
      await page.locator('#note-window-aggregation .note-return').click();
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '133');
      await page.getByRole('button', { name: '查看末尾', exact: true }).click();
      await page.waitForFunction(
        (score) =>
          document.querySelector('[data-testid=contribution-total]')?.textContent === score,
        data.models[0].scores.at(-1).toFixed(9),
      );
      for (const [key, count] of Object.entries(data.models[0].metrics.point_wise)) {
        if (['tp', 'fp', 'fn', 'tn'].includes(key))
          assert.equal(
            await page.locator(`[data-testid=count-${key}] strong`).innerText(),
            String(count),
          );
      }
      await page.locator('.contribution-row').first().click();
      await page.getByTestId('sensor-window-error').waitFor();
      assert.equal(await page.locator('.window-error-grid button').count(), 1);
      await page.screenshot({ path: `${output}/${data.dataset.id}-${width}-playback.png` });
      assert.deepEqual(errors, []);
      checks.push({ dataset: data.dataset.id, width, resultVersion: data.resultVersion });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  `${output}/release-checks.json`,
  JSON.stringify({ commit: build.commit, base, checks }, null, 2),
);
console.log(
  `PASS released build ${build.commit.slice(0, 7)}: exact index/manifests/assets and both datasets on desktop/mobile`,
);
