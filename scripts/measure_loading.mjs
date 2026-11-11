import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { launchBrowser, showcaseUrl } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const base = showcaseUrl;
const out = qaDirectory('loading-times');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const result = [];
async function resources(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).origin === location.origin)
      .map((entry) => ({
        file: new URL(entry.name).pathname,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        duration: Math.round(entry.duration),
      })),
  );
}
function totals(entries) {
  return {
    requests: entries.length,
    transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
    encodedBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    decodedBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
  };
}
try {
  for (const dataset of ['converter', 'wind']) {
    for (const width of [1440, 390]) {
      for (const route of ['', 'data', 'training', 'anomalies', 'detection', 'playback']) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const url = new URL(base);
        url.searchParams.set('dataset', dataset);
        url.hash = '/' + route;
        const started = performance.now();
        await page.goto(url.href);
        await page.locator('h1:visible').waitFor();
        if (!route) await page.getByRole('link', { name: '开始查看', exact: true }).waitFor();
        if (route === 'data') {
          await page.locator('.normalization-section').scrollIntoViewIfNeeded();
          await page.locator('.normalization-equation strong').waitFor();
        }
        if (route === 'training')
          await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
        if (route === 'anomalies') await page.locator('.case-stage').waitFor();
        if (['detection', 'playback'].includes(route))
          await page.locator('.reconstruction-view').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const readyMs = Math.round(performance.now() - started);
        const initial = await resources(page);
        const details = [];
        async function measure(action, run, ready) {
          await page.evaluate(() => performance.clearResourceTimings());
          const began = performance.now();
          await run();
          await ready();
          const elapsedMs = Math.round(performance.now() - began);
          const entries = await resources(page);
          details.push({ action, elapsedMs, ...totals(entries), resources: entries });
        }
        if (route === 'playback') {
          await page.getByRole('slider', { name: '播放进度' }).fill('133');
          await page.getByTestId('contribution-total').waitFor();
          await measure(
            'calculation',
            () => page.getByRole('button', { name: '查看当前点计算', exact: false }).click(),
            () => page.getByTestId('aggregate-equation').waitFor(),
          );
          await measure(
            'adjacent-calculation',
            () => page.getByRole('slider', { name: '播放进度' }).fill('134'),
            () =>
              page.waitForFunction(
                () =>
                  document.querySelector('.aggregation-summary p')?.textContent.includes('134') &&
                  document.querySelector('[data-testid=aggregate-equation]'),
              ),
          );
        }
        if (route === 'detection')
          await measure(
            'model-result',
            () => page.getByRole('button', { name: '查看模型结果 →', exact: true }).click(),
            () => page.getByTestId('calculated-score').waitFor(),
          );
        if (route === 'anomalies')
          await measure(
            'case-result',
            () => page.getByRole('button', { name: '查看该片段检测 →', exact: true }).click(),
            () => page.locator('.case-reconstruction[aria-busy=false]').waitFor(),
          );
        assert.deepEqual(errors, []);
        const row = {
          dataset,
          width,
          route: route || 'home',
          readyMs,
          ...totals(initial),
          resources: initial,
          details,
        };
        result.push(row);
        console.log(`${dataset} ${width} ${row.route}: ${readyMs} ms, ${row.transferBytes} bytes`);
        await page.close();
      }
    }
  }
  await writeFile(out + '/loading-times.json', JSON.stringify({ base, result }, null, 2));
} finally {
  await browser.close();
}
