import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';
const base = showcaseUrl;
const out = qaDirectory('calculation');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const errors = [],
  checks = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '#/detection');
    await page.getByRole('button', { name: '查看模型结果', exact: true }).click();
    await page.getByTestId('calculated-score').waitFor();
    await page.getByRole('slider', { name: '片段查看时刻' }).fill('25');
    await page.waitForFunction(
      () => document.querySelector('#window-calculation')?.getAttribute('data-point') === '133',
    );
    assert.equal(await page.getByTestId('window-calculation-sum').innerText(), '4.976624427');
    assert.equal(await page.getByTestId('calculated-score').innerText(), '0.039812995');
    assert.equal(await page.locator('#window-calculation tbody tr').count(), 125);
    await page.locator('#window-calculation').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out + '/' + width + '-calculation.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#ref-window-calculation').click();
    await page.locator('#note-score-calculation:focus').waitFor();
    assert.equal(await page.locator('.explanation-entry').count(), 15);
    await page.locator('#note-score-calculation .note-return').click();
    await page.getByTestId('calculated-score').waitFor();
    assert.equal(await page.getByRole('slider', { name: '片段查看时刻' }).inputValue(), '25');
    assert.equal(await page.getByTestId('calculated-score').innerText(), '0.039812995');
    await page.goto(base + '#/playback');
    await page.getByRole('slider', { name: '播放进度' }).fill('133');
    await page.getByRole('button', { name: '查看当前点计算', exact: false }).click();
    await page.getByTestId('aggregate-equation').waitFor();
    assert.equal(await page.locator('.window-score-scroll tbody tr').count(), 64);
    assert.equal(
      await page
        .getByTestId('aggregate-equation')
        .locator('.math-fraction>span')
        .first()
        .innerText(),
      '2.566477956',
    );
    assert.equal(
      await page
        .getByTestId('aggregate-equation')
        .locator('.math-fraction>span')
        .last()
        .innerText(),
      '64',
    );
    assert.equal(
      await page.getByTestId('aggregate-equation').locator('strong').innerText(),
      '0.040101218',
    );
    await page
      .locator('.window-score-scroll tbody tr')
      .filter({ hasText: '第 108—171 点' })
      .getByRole('button')
      .click();
    await page.getByTestId('coverage-window-calculation-score').waitFor();
    assert.equal(
      await page.getByTestId('coverage-window-calculation-score').innerText(),
      '0.039812995',
    );
    await page.getByRole('slider', { name: '播放进度' }).fill('1');
    await page.getByTestId('aggregate-equation').waitFor();
    assert.equal(await page.locator('.window-score-scroll tbody tr').count(), 1);
    await page.getByRole('slider', { name: '播放进度' }).fill('2397');
    await page.getByTestId('aggregate-equation').waitFor();
    assert.equal(await page.locator('.window-score-scroll tbody tr').count(), 1);
    await page.getByRole('slider', { name: '播放进度' }).fill('133');
    await page.locator('.aggregation-summary').scrollIntoViewIfNeeded();
    await page.screenshot({ path: out + '/' + width + '-aggregation.png' });
    await page.getByRole('combobox', { name: '播放速度' }).selectOption('2');
    await page.locator('#ref-playback-window-aggregation').click();
    await page.locator('#note-window-aggregation:focus').waitFor();
    await page.locator('#note-window-aggregation .note-return').click();
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '133');
    assert.equal(await page.getByRole('combobox', { name: '播放速度' }).inputValue(), '2');
    assert.ok(await page.getByRole('button', { name: '播放', exact: true }).isVisible());
    await page.goto(base + '#/data');
    await page.getByRole('button', { name: '剔除无效记录', exact: true }).click();
    await page.getByRole('button', { name: '连续缺失', exact: true }).click();
    const dataText = await page.locator('.data-chapter').innerText();
    assert.ok(!/缺失率|这些底部油温|均包含/.test(dataText));
    const normalizationText = await page.locator('.normalization-heading').innerText();
    assert.match(normalizationText, /训练集的最小值和最大值/);
    assert.match(normalizationText, /测试值截断至\s*0—1/);
    assert.equal(await page.locator('.removed-sensors li span').count(), 0);
    assert.equal(await page.locator('.balanced-split br').count(), 0);
    assert.ok(
      await page.locator('.split-dates').evaluateAll((es) =>
        es.every((e) => {
          const ts = e.querySelectorAll('time');
          return (
            Math.abs(ts[0].getBoundingClientRect().top - ts[1].getBoundingClientRect().top) < 1
          );
        }),
      ),
    );
    await page.locator('.balanced-split').screenshot({ path: out + '/' + width + '-split.png' });
    await page.getByRole('link', { name: '数据说明：原始数据与处理例子（注 1）' }).click();
    const examples = page.locator('#note-data-records');
    await page.getByRole('button', { name: '原始数据', exact: true }).click();
    await page.getByRole('table', { name: '原始数据片段' }).waitFor();
    assert.equal(await examples.locator('tbody tr').count(), 5);
    assert.equal(await examples.locator('input[type=range]').count(), 0);
    assert.equal(await examples.locator('.raw-missing-cell').count(), 6);
    await page.getByRole('button', { name: '缺失值填补', exact: true }).click();
    await page.getByRole('button', { name: '单点缺失', exact: true }).click();
    assert.equal(await examples.locator('.filled-row').count(), 1);
    assert.match(await examples.locator('.filled-row td').last().innerText(), /0\s*已填补/);
    await page.getByRole('button', { name: '连续缺失', exact: true }).click();
    assert.equal(await examples.locator('.filled-row').count(), 3);
    await page.locator('#note-data-records .note-return').click();
    assert.equal(
      await page
        .getByRole('button', { name: '还原无效记录', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page
        .getByRole('button', { name: '连续缺失', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await page.getByRole('link', { name: '数据说明：原始数据与处理例子（注 1）' }).click();
    assert.equal(
      await page
        .getByRole('button', { name: '缺失值填补', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await examples.locator('.filled-row').count(), 3);
    await page.getByRole('button', { name: '无效记录裁剪', exact: true }).click();
    for (const [name, range, total] of [
      ['中间 24 条', '3,433—3,456', '24'],
      ['末尾 744 条', '8,017—8,760', '744'],
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.match(
        await examples.locator('.removed-record-row').innerText(),
        new RegExp(range + '.*删除 ' + total + ' 条', 's'),
      );
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await examples.screenshot({ path: out + '/' + width + '-record-examples.png' });
    await page.goto(base + '#/metrics?note=thresholds');
    await page.locator('#note-thresholds:focus').waitFor();
    await page.screenshot({ path: out + '/' + width + '-notes.png' });
    await page.reload();
    await page.locator('#note-thresholds:focus').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 1440) {
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    checks.push({
      width,
      all125Rows: true,
      exactCalculation: true,
      all64Windows: true,
      edgeCoverage: true,
      roundTrip: true,
      deepLinkReload: true,
    });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '#/playback');
  await page.getByRole('slider', { name: '播放进度' }).fill('130');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('[aria-label="播放进度"]').value) > 130,
  );
  await page.locator('#ref-playback-window-aggregation').click();
  await page.locator('#note-window-aggregation:focus').waitFor();
  await page.locator('#note-window-aggregation .note-return').click();
  const n = await page.getByRole('slider', { name: '播放进度' }).inputValue();
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), n);
  assert.ok(await page.getByRole('button', { name: '播放', exact: true }).isVisible());

  checks.push({ playingRoundTripPauses: true });
  await page.close();
  assert.deepEqual(errors, []);
  await writeFile(out + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(
    'PASS calculation, coverage, footnotes, mobile/desktop, 200%, deep links, state retention and pause',
  );
} finally {
  await browser.close();
}
