import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, selectFeature } from './browser.mjs';

const base = showcaseUrl;
const out = qaDirectory('playback_scale');
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const series = async (asset, feature = 'mean') => {
  const buffer = await readFile(`public/data/journey/curves-v1/${asset.sha256}/${feature}.bin`);
  return Array.from(
    new Float64Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
  );
};
const input = await series(manifest.input);
const recon = await series(manifest.models[0].recon);
const browser = await launchBrowser();
const errors = [];
const observations = [];
const readScale = (page) =>
  page.locator('.playback-plots .curve').evaluateAll((curves) =>
    curves.map((curve) => ({
      low: Number(curve.dataset.yMin),
      high: Number(curve.dataset.yMax),
      paths: [...curve.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      width: curve.querySelector('svg').viewBox.baseVal.width,
      height: curve.querySelector('svg').viewBox.baseVal.height,
      plotLeft: Number(curve.querySelector('clipPath rect').getAttribute('x')),
      plotWidth: Number(curve.querySelector('clipPath rect').getAttribute('width')),
    })),
  );
const bounds = (scale) => [scale.low, scale.high];
const expectedBounds = (count, values) => {
  const start = Math.max(0, Math.min(2397 - 64, count - 1 - 40));
  const visible = values.flatMap((v) => v.slice(start, count));
  const min = Math.min(...visible),
    max = Math.max(...visible);
  const pad = (max - min) * 0.12;
  return [Math.max(0, min - pad), max + pad];
};
const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const verifySamples = (scale, count, values) => {
  const start = Math.max(0, Math.min(2397 - 64, count - 1 - 40));
  for (let j = 0; j < values.length; j++) {
    const vertices = [...scale.paths[j].matchAll(/[ML]([\d.-]+),([\d.-]+)/g)];
    assert.equal(vertices.length, count - start);
    for (let i = 0; i < vertices.length; i++) {
      near(Number(vertices[i][1]), scale.plotLeft + (i / 63) * scale.plotWidth, 0.006);
      near(
        Number(vertices[i][2]),
        20 + ((scale.high - values[j][start + i]) / (scale.high - scale.low)) * (scale.height - 52),
        0.006,
      );
    }
  }
};
async function open(width, motion = 'no-preference', touch = false) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: motion,
    hasTouch: touch,
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(base + '#/playback');
  await page.locator('.reconstruction-view').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const now = new Date('2026-10-29T08:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  return page;
}
try {
  for (const width of [1440, 390]) {
    const page = await open(width);
    const progress = page.getByRole('slider', { name: '播放进度' });
    await progress.fill('835');
    const before = await readScale(page);
    assert.deepEqual(bounds(before[0]), expectedBounds(835, [input, recon]));
    await progress.fill('836');
    await page.clock.runFor(800);
    const after = await readScale(page);
    assert.deepEqual(
      bounds(after[0]),
      bounds(before[0]),
      'unrevealed point 859 must not rescale point 836',
    );
    verifySamples(after[0], 836, [input, recon]);
    await page.screenshot({ path: `${out}/${width}-836.png` });

    await progress.fill('858');
    await page.clock.runFor(800);
    const from = await readScale(page);
    await progress.fill('859');
    const start = await readScale(page);
    near(start[0].low, from[0].low);
    await page.clock.runFor(80);
    const middle = await readScale(page);
    await page.clock.runFor(220);
    const end = await readScale(page);
    assert.ok(
      middle[0].low < from[0].low && middle[0].low > end[0].low,
      'new visible low point expands smoothly',
    );
    verifySamples(middle[0], 859, [input, recon]);
    verifySamples(end[0], 859, [input, recon]);
    for (let i = 0; i < 2; i++) {
      assert.notDeepEqual(bounds(middle[i]), bounds(from[i]), 'both playback plots animate');
      assert.notDeepEqual(bounds(middle[i]), bounds(end[i]));
    }

    await progress.fill('899');
    await page.clock.runFor(800);
    const held = await readScale(page);
    await progress.focus();
    await page.keyboard.down('ArrowRight');
    assert.equal(await progress.inputValue(), '900');
    await page.clock.runFor(1000);
    assert.deepEqual(
      bounds((await readScale(page))[0]),
      bounds(held[0]),
      'keep bounds while a seek key is held',
    );
    await page.keyboard.up('ArrowRight');
    await page.clock.runFor(400);
    assert.deepEqual(
      bounds((await readScale(page))[0]),
      bounds(held[0]),
      'contraction waits for a pause',
    );
    await page.clock.runFor(150);
    const tightening = await readScale(page);
    await page.clock.runFor(400);
    const tightened = await readScale(page);
    assert.ok(
      tightening[0].low > held[0].low && tightening[0].low < tightened[0].low,
      'delayed contraction animates',
    );
    assert.deepEqual(bounds(tightened[0]), expectedBounds(900, [input, recon]));
    verifySamples(tightened[0], 900, [input, recon]);

    // Exercise a native pointer drag and release outside the slider.
    await progress.scrollIntoViewIfNeeded();
    const box = await progress.boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    await page.mouse.down();
    for (const fraction of [0.35, 0.38, 0.32, 0.6]) {
      await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2, { steps: 3 });
      await page.clock.runFor(60);
    }
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height + 30);
    await page.mouse.up();
    await page.clock.runFor(1000);
    assert.ok(Number(await progress.inputValue()) > 1300, 'native pointer drag updates progress');

    // Interrupt an expansion, then let the last seek settle.
    for (const count of [835, 859, 900, 859, 900]) {
      await progress.fill(String(count));
      await page.clock.runFor(32);
    }
    await page.clock.runFor(1000);
    assert.deepEqual(bounds((await readScale(page))[0]), expectedBounds(900, [input, recon]));
    await page.getByRole('combobox', { name: '播放速度' }).selectOption('16');
    await progress.fill('830');
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.clock.runFor(1500);
    assert.ok(
      Number(await progress.inputValue()) > 860,
      '16x playback progresses through the old jump',
    );
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.clock.runFor(1000);
    verifySamples((await readScale(page))[0], Number(await progress.inputValue()), [input, recon]);

    await page.getByRole('button', { name: 'SMST-AD', exact: true }).click();
    await page.locator('.reconstruction-view').waitFor();
    await selectFeature(page, '4');
    await page.locator('.reconstruction-view').waitFor();
    const featureInput = await series(manifest.input, '4');
    const featureRecon = await series(manifest.models[1].recon, '4');
    verifySamples((await readScale(page))[0], Number(await progress.inputValue()), [
      featureInput,
      featureRecon,
    ]);
    await page.getByRole('button', { name: '查看末尾', exact: true }).click();
    await page.getByRole('combobox', { name: '播放范围' }).selectOption('window');
    assert.equal(await progress.inputValue(), '0');
    await page.getByRole('button', { name: '查看末尾', exact: true }).click();
    assert.equal(await progress.inputValue(), '64');
    assert.equal((await readScale(page))[0].paths[0].match(/[ML]/g).length, 64);
    await page.getByRole('button', { name: '重置', exact: true }).click();
    assert.ok((await readScale(page)).every((scale) => scale.paths.every((path) => !path.trim())));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    observations.push({
      width,
      before: bounds(before[0]),
      after: bounds(after[0]),
      expansion: [from, middle, end].map((s) => bounds(s[0])),
      contraction: [held, tightening, tightened].map((s) => bounds(s[0])),
    });
    await page.close();
    console.log(
      `PASS ${width}px: revealed bounds, both animated scales, keyboard/pointer, interruption, 16x, model/feature and scope`,
    );
  }
  const reduced = await open(390, 'reduce', true);
  const progress = reduced.getByRole('slider', { name: '播放进度' });
  await progress.fill('858');
  await progress.fill('859');
  const immediate = await readScale(reduced);
  assert.deepEqual(bounds(immediate[0]), expectedBounds(859, [input, recon]));
  await pageTouch(reduced, progress);
  assert.ok(Number(await progress.inputValue()) > 1100);
  await progress.fill('900');
  await reduced.clock.runFor(500);
  assert.deepEqual(bounds((await readScale(reduced))[0]), expectedBounds(900, [input, recon]));
  await reduced.close();
  assert.deepEqual(errors, []);
  await writeFile(`${out}/results.json`, JSON.stringify({ observations, errors }, null, 2));
  console.log('PASS reduced motion and touch selection');
} finally {
  await browser.close();
}

async function pageTouch(page, progress) {
  await progress.scrollIntoViewIfNeeded();
  const box = await progress.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
