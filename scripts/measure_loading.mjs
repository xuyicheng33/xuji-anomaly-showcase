import { launchBrowser, showcaseUrl } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const base = showcaseUrl;
const out = process.env.QA_DIR || '.qa/loading-times';
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const result = [];
try {
  for (const route of ['data', 'training', 'detection', 'playback']) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    page.setDefaultTimeout(90000);
    const started = performance.now();
    await page.goto(base + '#/' + route);
    await page.locator('h1:visible').waitFor();
    const pageMs = Math.round(performance.now() - started);
    if (route === 'data') await page.locator('.normalization-section').scrollIntoViewIfNeeded();
    if (route === 'training')
      await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    else
      await page
        .locator(route === 'data' ? '.data-chapter .curve' : '.reconstruction-view')
        .first()
        .waitFor();
    const curveMs = Math.round(performance.now() - started);
    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((r) => r.name.includes('/data/journey/'))
        .map((r) => ({
          file: new URL(r.name).pathname.split('/data/journey/')[1],
          transferSize: r.transferSize,
          encodedBodySize: r.encodedBodySize,
          duration: Math.round(r.duration),
        })),
    );
    result.push({ route, pageMs, curveMs, resources });
    console.log(
      route,
      curveMs,
      'ms',
      resources.reduce((s, r) => s + r.transferSize, 0),
      'bytes',
    );
    await page.close();
  }
  await writeFile(out + '/loading-times.json', JSON.stringify({ base, result }, null, 2));
} finally {
  await browser.close();
}
