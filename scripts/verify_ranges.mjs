import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';

const out = process.env.QA_DIR || '.qa/ranges';
await mkdir(out, { recursive: true });
const wind = process.env.SHOWCASE_DATASET === 'wind';
const dataPath = wind ? 'wind' : 'journey';
const referencePath = `public/data/${dataPath}/`;
const data = JSON.parse(await readFile(`public/data/${dataPath}/manifest.json`, 'utf8'));
const sourceFiles = new Map();
for (const model of data.models)
  for (const chunk of model.windows.chunks) sourceFiles.set(chunk.file, chunk);
const browser = await launchBrowser();
try {
  for (let rep = 0; rep < 3; rep++) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const requests = [];
    let mode = 'valid';
    await page.route('**/windows-v1/**/*.bin*', async (route) => {
      const pathname = new URL(route.request().url()).pathname.split(`/data/${dataPath}/`)[1];
      const chunk = sourceFiles.get(pathname);
      const source = await readFile(referencePath + pathname);
      const range = route.request().headers().range;
      requests.push({ range, bytes: source.length });
      if (mode === 'fail') return route.fulfill({ status: 503, body: 'unavailable' });
      if (!range || mode === 'whole')
        return route.fulfill({
          status: 200,
          body: source,
          contentType: 'application/octet-stream',
        });
      if (mode === 'invalid')
        return route.fulfill({
          status: 206,
          body: 'bad',
          headers: { 'Content-Range': 'bytes 0-2/3' },
          contentType: 'application/octet-stream',
        });
      const parts = range
        .slice(6)
        .split(',')
        .map((item) => item.split('-').map(Number));
      if (mode === 'changed') source[parts[0][0]] ^= 1;
      if (parts.length === 1) {
        const [start, end] = parts[0];
        return route.fulfill({
          status: 206,
          body: source.subarray(start, end + 1),
          headers: { 'Content-Range': `bytes ${start}-${end}/${chunk.bytes}` },
          contentType: 'application/octet-stream',
        });
      }
      const buffers = [];
      for (const [start, end] of parts)
        buffers.push(
          Buffer.from(`--range\r\nContent-Range: bytes ${start}-${end}/${chunk.bytes}\r\n\r\n`),
          source.subarray(start, end + 1),
          Buffer.from('\r\n'),
        );
      buffers.push(Buffer.from('--range--\r\n'));
      return route.fulfill({
        status: 206,
        body: Buffer.concat(buffers),
        contentType: 'multipart/byteranges; boundary=range',
      });
    });
    await page.goto(showcaseUrl + '#/playback');
    for (const count of [1, 132, data.times.length]) {
      await page.getByRole('slider', { name: '播放进度' }).fill(String(count));
      await page.getByTestId('contribution-total').waitFor();
      await page.locator('.contribution-row').first().click();
      await page.getByTestId('sensor-mean-error').waitFor();
      const feature = Number(
        await page.locator('.sensor-window-detail').getAttribute('data-feature'),
      );
      const first = Math.max(0, count - data.window),
        last = Math.min(count - 1, data.times.length - data.window);
      assert.equal(await page.locator('.window-error-grid button').count(), last - first + 1);
      for (const [local, start] of [
        [0, first],
        [last - first, last],
      ]) {
        await page.locator('.window-error-grid button').nth(local).click();
        const chunk = data.models[0].windows.chunks.find(
          (c) => start >= c.start && start < c.start + c.count,
        );
        const raw = await readFile(referencePath + chunk.file);
        const offset =
          ((start - chunk.start) * data.window + count - 1 - start) * data.features.length +
          feature;
        const expected = raw.readFloatLE(offset * 4);
        assert.equal(
          await page.getByTestId('sensor-window-prediction').innerText(),
          expected.toFixed(9),
        );
      }
      await page.getByRole('button', { name: '收起明细', exact: true }).click();
    }
    assert.ok(requests.every((request) => request.range));
    mode = 'invalid';
    await page.getByRole('slider', { name: '播放进度' }).fill('200');
    await page.getByTestId('contribution-total').waitFor();
    await page.locator('.contribution-row').first().click();
    await page.getByTestId('sensor-mean-error').waitFor();
    assert.ok(requests.some((request) => !request.range));
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    mode = 'changed';
    const beforeChanged = requests.length;
    await page.getByRole('slider', { name: '播放进度' }).fill('400');
    await page.getByTestId('contribution-total').waitFor();
    await page.locator('.contribution-row').first().click();
    await page.getByTestId('sensor-mean-error').waitFor();
    assert.ok(requests.slice(beforeChanged).some((request) => !request.range));
    await page.locator('.window-error-grid button').first().click();
    const start = 400 - data.window;
    const chunk = data.models[0].windows.chunks.find(
      (c) => start >= c.start && start < c.start + c.count,
    );
    const raw = await readFile(referencePath + chunk.file);
    const feature = Number(
      await page.locator('.sensor-window-detail').getAttribute('data-feature'),
    );
    const offset =
      ((start - chunk.start) * data.window + data.window - 1) * data.features.length + feature;
    assert.equal(
      await page.getByTestId('sensor-window-prediction').innerText(),
      raw.readFloatLE(offset * 4).toFixed(9),
    );
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    mode = 'whole';
    await page.getByRole('slider', { name: '播放进度' }).fill('600');
    await page.getByTestId('contribution-total').waitFor();
    await page.locator('.contribution-row').first().click();
    await page.getByTestId('sensor-mean-error').waitFor();
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    const afterWhole = requests.length;
    for (const count of [601, 602]) {
      await page.getByRole('slider', { name: '播放进度' }).fill(String(count));
      await page.getByTestId('contribution-total').waitFor();
      await page.locator('.contribution-row').first().click();
      await page.getByTestId('sensor-mean-error').waitFor();
      await page.getByRole('button', { name: '收起明细', exact: true }).click();
    }
    assert.equal(requests.length, afterWhole, 'adjacent windows reuse full-file responses');
    mode = 'fail';
    await page.getByRole('slider', { name: '播放进度' }).fill('900');
    await page.getByTestId('contribution-total').waitFor();
    await page.locator('.contribution-row').first().click();
    await page.getByRole('button', { name: '重试测点明细', exact: true }).waitFor();
    mode = 'valid';
    await page.getByRole('button', { name: '重试测点明细', exact: true }).click();
    await page.getByTestId('sensor-mean-error').waitFor();
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '900');
    if (rep === 0) {
      const catalog = JSON.parse(
        await readFile(referencePath + 'calculation-v1/manifest.json', 'utf8'),
      );
      let indexRequests = 0;
      await page.route('**/calculation-v1/manifest.json', (route) => {
        indexRequests++;
        return route.fulfill({
          json: indexRequests === 1 ? { ...catalog, resultVersion: 'stale' } : catalog,
        });
      });
      await page.getByRole('button', { name: '查看当前点计算', exact: false }).click();
      await page.getByRole('button', { name: '重试计算索引', exact: true }).click();
      await page.getByTestId('aggregate-equation').waitFor();
      assert.equal(indexRequests, 2);
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '900');
    }
    await page.close();
  }
  console.log(
    'PASS exact ranges, changed partial content, verified full-file reuse, failed transfer and stale-index retry x3',
  );
} finally {
  await browser.close();
}
