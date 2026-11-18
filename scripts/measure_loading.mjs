import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, qaDirectory } from './browser.mjs';

const { values } = parseArgs({
  options: {
    repeats: { type: 'string', default: '3' },
    widths: { type: 'string', default: '1440,390' },
    routes: { type: 'string', default: 'home,data,training,anomalies,detection,playback' },
    'latency-ms': { type: 'string', default: '0' },
    'download-kbps': { type: 'string', default: '0' },
  },
});
const repeats = Number(values.repeats);
const widths = values.widths.split(',').map(Number);
const routes = values.routes.split(',');
const selectors = {
  home: '.home-hero .primary',
  data: '.normalization-equation strong',
  training: '[role="img"][aria-label="归一化训练数据"]',
  anomalies: '.case-stage',
  detection: '.reconstruction-view',
  playback: '.playback-page[data-curves-ready=true]',
};
assert.ok(Number.isInteger(repeats) && repeats >= 3, 'Use at least three samples');
assert.ok(widths.every((n) => Number.isInteger(n) && n >= 320));
assert.ok(routes.every((route) => route in selectors));
const network = {
  latency: Number(values['latency-ms']),
  downloadKbps: Number(values['download-kbps']),
};
assert.ok(Object.values(network).every((n) => Number.isFinite(n) && n >= 0));
const out = qaDirectory('loading-times');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const samples = [];
const totals = (entries) => ({
  requests: entries.length,
  transferBytes: entries.reduce((sum, r) => sum + r.transferSize, 0),
  encodedBytes: entries.reduce((sum, r) => sum + r.encodedBodySize, 0),
});
async function resources(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).origin === location.origin)
      .map((entry) => ({
        file: new URL(entry.name).pathname,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      })),
  );
}
try {
  for (const dataset of ['converter', 'wind'])
    for (const width of widths)
      for (const route of routes) {
        for (let repetition = 0; repetition < repeats; repetition++) {
          const page = await browser.newPage({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
          });
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          if (network.latency || network.downloadKbps) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {
              offline: false,
              latency: network.latency,
              downloadThroughput: network.downloadKbps ? (network.downloadKbps * 1024) / 8 : -1,
              uploadThroughput: -1,
            });
          }
          await page.addInitScript((selector) => {
            const marks = (window.__loadingMarks = {});
            const check = () => {
              if (!marks.headerMs && document.querySelector('.site-header'))
                marks.headerMs = performance.now();
              if (!marks.contentMs && document.querySelector(selector))
                marks.contentMs = performance.now();
            };
            new MutationObserver(check).observe(document, {
              childList: true,
              subtree: true,
              attributes: true,
            });
          }, selectors[route]);
          const url = new URL(showcaseUrl);
          url.searchParams.set('dataset', dataset);
          url.hash = route === 'home' ? '/' : '/' + route;
          for (const cache of ['cold', 'warm']) {
            if (cache === 'warm') {
              await page.evaluate(() => sessionStorage.clear());
              await page.reload({ waitUntil: 'domcontentloaded' });
            } else await page.goto(url.href, { waitUntil: 'domcontentloaded' });
            await page.locator('h1:visible').waitFor();
            if (route === 'data')
              await page.locator('.normalization-section').scrollIntoViewIfNeeded();
            await page.locator(selectors[route]).waitFor();
            const marks = await page.evaluate(async () => {
              await document.fonts.ready;
              return { ...window.__loadingMarks, fontsMs: performance.now() };
            });
            const initial = await resources(page);
            const details = [];
            async function measure(action, run, ready) {
              await page.evaluate(() => performance.clearResourceTimings());
              const started = performance.now();
              await run();
              await ready();
              const elapsedMs = performance.now() - started;
              const entries = await resources(page);
              details.push({ action, elapsedMs, ...totals(entries) });
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
                      document
                        .querySelector('.aggregation-summary p')
                        ?.textContent.includes('134') &&
                      document.querySelector('[data-testid=aggregate-equation]'),
                  ),
              );
            }
            if (route === 'detection')
              await measure(
                'model-result',
                () => Promise.resolve(),
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
              route,
              repetition,
              cache,
              ...marks,
              ...totals(initial),
              resources: initial,
              details,
            };
            samples.push(row);
          }
          await page.close();
        }
        console.log(`Measured ${dataset} ${width} ${route}: ${repeats} cold/warm pairs`);
      }
  const percentile = (numbers, percent) =>
    [...numbers].sort((a, b) => a - b)[Math.ceil(numbers.length * percent) - 1];
  const groups = Map.groupBy(
    samples,
    (row) => `${row.dataset}/${row.width}/${row.route}/${row.cache}`,
  );
  const summary = Array.from(groups, ([scenario, rows]) => ({
    scenario,
    count: rows.length,
    medianHeaderMs: percentile(
      rows.map((r) => r.headerMs),
      0.5,
    ),
    medianContentMs: percentile(
      rows.map((r) => r.contentMs),
      0.5,
    ),
    p95ContentMs: percentile(
      rows.map((r) => r.contentMs),
      0.95,
    ),
    medianFontsMs: percentile(
      rows.map((r) => r.fontsMs),
      0.5,
    ),
    medianTransferBytes: percentile(
      rows.map((r) => r.transferBytes),
      0.5,
    ),
  }));
  await writeFile(
    out + '/loading-times.json',
    JSON.stringify({ base: showcaseUrl, network, repeats, summary, samples }, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser.close();
}
