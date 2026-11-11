import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { launchBrowser, showcaseUrl } from './browser.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = showcaseUrl;
const folder = qaDirectory('acceptance');
await mkdir(folder, { recursive: true });
const b = await launchBrowser();
const errors = [],
  checks = [];
const cases = JSON.parse(
  await readFile('public/data/journey/anomaly-cases-v1/manifest.json', 'utf8'),
).cases;
const values = async (asset) => {
  const buffer = await readFile('public/data/journey/' + asset.file);
  return new Float64Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
  );
};
try {
  for (const width of [1440, 390]) {
    const p = await b.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(base + '#/anomalies');
    await p.locator('.case-stage').waitFor();
    const picker = p.locator('.case-selection-summary');
    if (width === 390) {
      assert.equal(await picker.getAttribute('aria-expanded'), 'false');
      assert.equal(await p.locator('.case-kinds').isVisible(), false);
      await p.screenshot({ path: folder + '/390-anomalies-entry.png' });
    }
    const item = cases.find((item) => item.insertion === 'replace' && item.kind === 'reference');
    const material = await values(item.material);
    await p.getByRole('button', { name: '异常素材', exact: true }).click();
    for (const [step, name] of ['取参考片段', '时间反转', '幅值翻转'].entries()) {
      await p.getByRole('button', { name, exact: true }).click();
      const endpoints = await p
        .locator('.reference-construction [data-source-point]')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            source: Number(element.dataset.sourcePoint),
            position: Number(element.dataset.position),
            value: Number(element.dataset.value),
          })),
        );
      assert.equal(endpoints.length, 2);
      for (const endpoint of endpoints) {
        const original = material[(item.begin + endpoint.source) * 125 + item.feature];
        assert.ok(
          Math.abs(endpoint.position - (step === 0 ? endpoint.source : 23 - endpoint.source)) <
            1e-12,
        );
        assert.ok(Math.abs(endpoint.value - (step === 2 ? 1 - original : original)) < 1e-12);
      }
    }
    const original = await values(item.original),
      input = await values(item.input);
    await p.getByRole('button', { name: '插入过程', exact: true }).click();
    assert.equal(await p.locator('.case-stage').getAttribute('data-written'), '12');
    for (const point of [18, 29, 30, 41]) {
      await p.locator('.case-label-cells button').nth(point).click();
      const expected = (point < 30 ? input : original)[point * 125 + item.feature];
      assert.equal(await p.getByTestId('case-after').innerText(), expected.toFixed(4));
    }
    if (await picker.isVisible()) await picker.click();
    await p.locator('.case-methods button').filter({ hasText: '混合' }).click();
    const mixed = cases.find((item) => item.insertion === 'blend' && item.kind === 'reference');
    await p.locator('.case-stage[data-case="' + mixed.id + '"]').waitFor();
    await p.getByRole('button', { name: '插入过程', exact: true }).click();
    const mixedBase = await values(mixed.original),
      mixedInput = await values(mixed.input),
      index = 30 * 125 + mixed.feature;
    assert.equal(
      await p.getByTestId('case-after').innerText(),
      ((mixedBase[index] + mixedInput[index]) / 2).toFixed(4),
    );
    checks.push({ width, referenceTransforms: 3, replacementExactPoints: 4, blendMidpoint: true });
    if (await picker.isVisible()) await picker.click();
    await p.locator('.case-kinds button').filter({ hasText: '长度调整' }).click();
    await p.locator('.length-source').waitFor();
    const bounds = await p
      .locator('.case-stage .curve')
      .evaluate((e) => [e.dataset.yMin, e.dataset.yMax]);
    for (const step of ['原始片段', '异常素材', '插入过程', '标签结果']) {
      await p.getByRole('button', { name: step, exact: true }).click();
      assert.deepEqual(
        await p.locator('.case-stage .curve').evaluate((e) => [e.dataset.yMin, e.dataset.yMax]),
        bounds,
      );
    }
    await p.getByRole('button', { name: '查看来源第 26 点', exact: true }).click();
    assert.match(await p.locator('.length-mapping').innerText(), /40—42/);
    assert.equal(await p.locator('.length-destination button[aria-pressed=true]').count(), 3);
    assert.equal(await p.locator('.length-destination button').count(), 24);
    await p.getByRole('link', { name: /注 \d+：长度调整与采样/ }).click();
    assert.match(await p.locator('#note-length-sampling').innerText(), /A、C、E、G/);
    await p.locator('#note-length-sampling .note-return').click();
    await p.locator('.length-construction').waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: folder + '/' + width + '-length.png', fullPage: true });
    if (width === 390) {
      await p.locator('.length-construction').screenshot({ path: folder + '/390-sampling.png' });
      await p.evaluate(() => (document.documentElement.style.zoom = '2'));
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.evaluate(() => (document.documentElement.style.zoom = '1'));
    }
    checks.push({ width, lengthSourceH: '40—42', materialCount: 24, stableDomain: bounds });
    for (const route of ['models', 'training', 'detection']) {
      await p.goto(base + '#/' + route);
      await p.locator('h1:visible').waitFor();
      if (route === 'training')
        await p.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
      if (route === 'detection') {
        await p.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
        await p.getByTestId('calculated-score').waitFor();
        assert.equal(await p.locator('.reconstruction-view .legend .line-dashed').count(), 1);
      }
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: folder + '/' + width + '-' + route + '.png', fullPage: true });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '#/anomalies');
  await p.locator('.case-stage').waitFor();
  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: '原始片段', exact: true }).click();
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.getByRole('button', { name: '播放构造', exact: true }).click();
    await p.waitForFunction(() => {
      const r = document.querySelector('.case-stage .curve svg').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    });
    await p.getByRole('button', { name: '暂停', exact: true }).click();
    const phase = await p.locator('.case-stage').getAttribute('data-phase');
    assert.ok(Number(phase) < 3);
    if (i === 0) await p.screenshot({ path: folder + '/390-play-visible.png' });
  }
  checks.push({ mobilePlaybackVisible: 3 });
  await p.close();
  assert.deepEqual(errors, []);
  await writeFile(folder + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(
    'PASS reference transforms, exact replacement and blend midpoint, length H mapping, 24 destination points, stable axes, 200% layout, training charts and mobile autoplay positioning x3',
  );
} finally {
  await b.close();
}
