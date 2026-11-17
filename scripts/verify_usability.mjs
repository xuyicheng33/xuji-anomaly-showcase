import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, selectFeature } from './browser.mjs';

function pageLayout() {
  return {
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > innerWidth)
      .filter((element) => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX))
            return false;
        }
        return true;
      })
      .map((element) => ({
        note: element.closest('.explanation-entry')?.id,
        tag: element.tagName,
        className: element.getAttribute('class'),
        text: element.textContent.slice(0, 100),
        right: element.getBoundingClientRect().right,
        font: getComputedStyle(element).fontFamily,
      }))
      .slice(0, 20),
  };
}

const base = showcaseUrl;
const out = qaDirectory('usability');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
const manifest = JSON.parse(await readFile('public/data/journey/manifest.json', 'utf8'));
const checks = [],
  errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  let failing = true;
  await page.route('**/data/journey/manifest.json', (r) =>
    failing ? r.fulfill({ status: 503, body: 'unavailable' }) : r.continue(),
  );
  await page.goto(base + '#/metrics?note=training-mse');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /资料读取失败/);
  failing = false;
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.locator('#note-training-mse:focus').waitFor();
  assert.equal(await page.locator('[role=alert]:visible').count(), 0);
  assert.equal(await page.locator('.explanation-entry').count(), 15);
  await page.close();

  checks.push({ manifestRetryKeepsDeepLink: true });
  const invalid = structuredClone(manifest);
  invalid.models[0].history = [];
  const invalidPage = await browser.newPage();
  invalidPage.on('pageerror', (e) => errors.push(String(e)));
  await invalidPage.route('**/data/journey/manifest.json', (r) => r.fulfill({ json: invalid }));
  await invalidPage.goto(base + '#/training');
  await invalidPage.getByRole('alert').filter({ hasText: '资料版本不匹配' }).waitFor();
  await invalidPage.unroute('**/data/journey/manifest.json');
  await invalidPage.getByRole('button', { name: '重新读取', exact: true }).click();
  await invalidPage.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
  await invalidPage.close();
  checks.push({ incompleteTrainingHistoryRejectedAndRetryable: true });
  const brokenChapter = await browser.newPage();
  await brokenChapter.route(
    /\/(?:assets\/ModelsChapter-[^/]+\.js|src\/report\/ModelsChapter\.tsx)(?:\?|$)/,
    (request) => request.fulfill({ status: 503, body: 'unavailable' }),
  );
  await brokenChapter.goto(base + '#/models');
  await brokenChapter.getByRole('alert').waitFor();
  assert.equal(await brokenChapter.locator('.site-header').isVisible(), true);
  const failure = await brokenChapter.getByRole('alert').boundingBox();
  assert.ok(failure.x > 0 && failure.width < 1440, 'Chapter failures retain the page margins');
  await brokenChapter.getByRole('link', { name: '数据整理', exact: true }).click();
  await brokenChapter.getByRole('heading', { name: '监测数据预处理', exact: true }).waitFor();
  await brokenChapter.close();
  checks.push({ failedChapterRetainsNavigation: true });
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '#/training');
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    if (width <= 390) {
      const menu = page.getByRole('button', { name: '目录', exact: true });
      await menu.click();
      await page.getByRole('navigation', { name: '章节导航' }).getByRole('link').first().focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await menu.evaluate((e) => e === document.activeElement), true);
      await menu.click();
      await page
        .getByRole('navigation', { name: '章节导航' })
        .getByRole('link', { name: '模型训练', exact: true })
        .click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    }
    assert.equal(await page.locator('.curve-selection').count(), 1);
    assert.equal(await page.locator('[data-anomaly-start]').count(), 0);
    assert.equal(
      await page.locator('.curve-selection').evaluate((element) => getComputedStyle(element).fill),
      'rgb(53, 95, 123)',
    );
    await page.getByRole('slider', { name: '训练窗口位置' }).fill('320');
    await page.getByRole('slider', { name: '训练轮次' }).fill('7');
    await page.locator('#ref-training-mse-section').click();
    await page.locator('#note-training-mse:focus').waitFor();
    assert.match(await page.locator('#note-training-mse').innerText(), /各批次的均值取平均/);
    assert.doesNotMatch(
      await page.locator('main').innerText(),
      /并不代表|是不是|这不意味着|不代表|并非/,
    );
    const labelTable = page.locator('.anomaly-label-table');
    assert.equal(await labelTable.locator('thead th').count(), 5);
    assert.ok(await labelTable.evaluate((element) => element.scrollWidth <= element.clientWidth));
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    const explanationLayout = await page.evaluate(pageLayout);
    await page.screenshot({ path: out + '/' + width + '-explanation-200.png' });
    assert.ok(
      explanationLayout.scrollWidth <= explanationLayout.viewport,
      'Explanation page overflow at 200%: ' + JSON.stringify(explanationLayout),
    );
    await page.evaluate(() => (document.documentElement.style.zoom = '1'));
    await page.locator('#note-training-mse .note-return').click();
    assert.equal(await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(), '320');
    assert.equal(await page.getByRole('slider', { name: '训练轮次' }).inputValue(), '7');
    await page.getByRole('img', { name: '训练重建误差（MSE）', exact: true }).waitFor();
    await page.goto(base + '#/detection');
    await page.locator('.reconstruction-view').waitFor();
    const startInput = page.getByRole('spinbutton', { name: '片段起点' });
    await startInput.fill('');
    assert.equal(await startInput.inputValue(), '');
    await startInput.pressSequentially('500');
    assert.equal(await startInput.inputValue(), '500');
    await startInput.press('Enter');
    assert.equal(await page.getByRole('slider', { name: '选择 64 点片段' }).inputValue(), '499');
    await startInput.fill('108');
    if (width <= 390) await selectFeature(page, '5');
    await page.getByRole('button', { name: '查看模型结果 →', exact: true }).click();
    await page.getByTestId('calculated-score').waitFor();
    assert.match(
      await page.locator('.calculation-scope').innerText(),
      /当前时刻整体判定.*全部 125 个测点/,
    );
    const scrollHint = page.locator('#window-calculation-scroll-hint');
    assert.match(await scrollHint.innerText(), /125 个测点.*上下滑动/);
    const horizontalOverflow = await page
      .locator('.calculation-table-scroll')
      .evaluate((table) => table.scrollWidth > table.clientWidth + 1);
    assert.equal((await scrollHint.innerText()).includes('左右滑动'), horizontalOverflow);
    if (width === 768) {
      const layout = await page.locator('.calculation-layout > div').evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, top: box.top, bottom: box.bottom };
        }),
      );
      assert.equal(layout[0].left, layout[1].left);
      assert.ok(layout[1].top >= layout[0].bottom);
    }
    if (width <= 390) {
      await page.getByRole('button', { name: '查看全部 125 个测点明细', exact: true }).click();
      const detail = page.getByRole('region', { name: '当前测点计算明细', exact: true });
      await detail.waitFor();
      assert.deepEqual(
        await detail.locator('dd').allTextContents(),
        await page.locator('.calculation-table .selected-sensor td').allTextContents(),
      );
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      const detailLayout = await page.evaluate(pageLayout);
      await page.screenshot({ path: out + '/' + width + '-calculation-200.png' });
      assert.ok(
        detailLayout.scrollWidth <= detailLayout.viewport,
        'Calculation page overflow at 200%: ' + JSON.stringify(detailLayout),
      );
      const contained = await detail.evaluate((e) => e.scrollWidth <= e.clientWidth);
      assert.equal(contained, true);
      await detail.screenshot({ path: out + '/' + width + '-detail-200.png' });
      await page.evaluate(() => (document.documentElement.style.zoom = '1'));
    }
    await page.evaluate(() => document.fonts.ready);
    const plot = page.locator('.reconstruction-view svg[role="img"]');
    await plot.focus();
    await page.keyboard.press('Home');
    assert.equal(await page.getByRole('slider', { name: '片段查看时刻' }).inputValue(), '0');
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('slider', { name: '片段查看时刻' }).inputValue(), '63');
    await plot.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const chart = await plot.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      };
    });
    assert.ok(chart.top >= 0 && chart.bottom <= chart.viewportHeight, JSON.stringify(chart));
    assert.ok(chart.left >= 0 && chart.right <= chart.viewportWidth, JSON.stringify(chart));
    if (width <= 768) {
      const hint = page.locator('#window-calculation-scroll-hint');
      assert.equal(await hint.isVisible(), true);
      const table = page.locator('.calculation-table-scroll');
      const data = await table.evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
      if (data.scroll > data.width) {
        await table.evaluate((e) => (e.scrollLeft = e.scrollWidth));
        assert.ok((await table.evaluate((e) => e.scrollLeft)) > 0);
        if (width <= 390) {
          assert.equal(
            await table
              .locator('tbody th')
              .first()
              .evaluate((e) => getComputedStyle(e).position),
            'sticky',
          );
          const lastValue = table.locator('.selected-sensor td').last();
          const visible = await lastValue.evaluate((e) => {
            const value = e.getBoundingClientRect();
            const viewport = e.closest('.calculation-table-scroll').getBoundingClientRect();
            return value.left >= viewport.left && value.right <= viewport.right;
          });
          assert.equal(visible, true);
        }
        await table.evaluate((e) => (e.scrollLeft = 0));
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: out + '/' + width + '-detection.png', fullPage: true });
    if (width <= 390) {
      await page.goto(base + '#/anomalies');
      await page.locator('.case-label-cells button').last().waitFor();
      const picker = page.locator('.case-selection-summary');
      const openPicker = async () => {
        if ((await picker.getAttribute('aria-expanded')) === 'false') await picker.click();
      };
      await openPicker();
      await page.getByText('查看构造说明与公式', { exact: true }).click();
      assert.match(await page.locator('.case-explanation').innerText(), /用异常素材替代局部原值/);
      await page.locator('.case-methods button').last().click();
      await page.locator('.case-label-cells button').last().waitFor();
      await openPicker();
      assert.match(await page.locator('.case-explanation').innerText(), /原始值 × \(1 − 权重\)/);
      await page.locator('.case-methods button').first().click();
      await openPicker();
      await page.getByText('查看构造说明与公式', { exact: true }).click();
      await page.getByRole('button', { name: '标签结果', exact: true }).click();
      const selected = () => page.locator('.case-label-cells [aria-pressed=true]');
      assert.equal(await page.locator('.case-label-cells button[tabindex="0"]').count(), 1);
      await selected().focus();
      await page.keyboard.press('ArrowRight');
      assert.match(await selected().getAttribute('aria-label'), /^第 32 点/);
      assert.equal(
        await selected().evaluate((element) => element === document.activeElement),
        true,
      );
      await page.keyboard.press('Home');
      assert.match(await selected().getAttribute('aria-label'), /^第 1 点/);
      await page.keyboard.press('End');
      assert.match(await selected().getAttribute('aria-label'), /^第 64 点/);
      await page.getByRole('slider', { name: '案例查看时刻' }).fill('30');
      assert.match(await selected().getAttribute('aria-label'), /^第 31 点/);
      await page.getByRole('button', { name: '前一点', exact: true }).click();
      assert.match(await selected().getAttribute('aria-label'), /^第 30 点/);
      await page.getByRole('button', { name: '后一点', exact: true }).click();
      assert.match(await selected().getAttribute('aria-label'), /^第 31 点/);
      await page.locator('.case-label-cells button').first().click({ force: true });
      assert.equal(
        await page.getByRole('button', { name: '前一点', exact: true }).isDisabled(),
        true,
      );
      await page.locator('.case-label-cells button').last().click({ force: true });
      assert.equal(
        await page.getByRole('button', { name: '后一点', exact: true }).isDisabled(),
        true,
      );
      const size = await page.getByRole('button', { name: '前一点', exact: true }).boundingBox();
      assert.ok(size.width >= 60 && size.height >= 40);
      await page.locator('#ref-anomalies-point-labels').click();
      await page.locator('#note-anomaly-labels:focus').waitFor();
      await page.locator('#note-anomaly-labels .note-return').click();
      assert.match(await selected().getAttribute('aria-label'), /^第 64 点/);
      await page.screenshot({ path: out + '/' + width + '-anomalies.png', fullPage: true });
    }
    await page.goto(base + '#/metrics?note=data-cleaning');
    const sensors = page.locator('.sensor-list');
    await sensors.waitFor();
    assert.equal(await page.locator('#sensor-table-hint').isVisible(), true);
    assert.match(await page.locator('#sensor-table-hint').innerText(), /125.*向下滚动/);
    await sensors.focus();
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => document.querySelector('.sensor-list').scrollTop > 0);
    await page.goto(base + '#/data');
    const removed = page.locator('.removed-sensors');
    await removed.waitFor();
    assert.equal(await removed.getAttribute('open'), null);
    await removed.locator('summary').click();
    assert.equal(await removed.locator('li:visible').count(), 11);
    await removed.locator('summary').click();
    assert.equal(await removed.locator('li:visible').count(), 0);
    if (width === 1440 || width === 390) {
      await page.goto(base + '#/playback');
      await page.locator('.playback-page[data-curves-ready=true]').waitFor();
      const progress = page.getByRole('slider', { name: '播放进度' });
      for (const model of manifest.models) {
        await page.getByRole('button', { name: model.name, exact: true }).click();
        for (const [code, name] of [
          ['tp', '检出'],
          ['fp', '误报'],
          ['fn', '漏检'],
        ]) {
          const matches = model.scores.flatMap((score, index) => {
            const actual = manifest.labels[index] > 0;
            const predicted = score > model.threshold;
            const outcome = actual ? (predicted ? 'tp' : 'fn') : predicted ? 'fp' : 'tn';
            return outcome === code ? [index] : [];
          });
          await progress.fill('0');
          const next = page.getByRole('button', { name: '下一处' + name, exact: true });
          await next.click();
          assert.equal(await progress.inputValue(), String(matches[0] + 1));
          await progress.fill(String(matches.at(-1) + 1));
          assert.equal(await next.isDisabled(), true);
        }
      }
      await progress.fill('2397');
      assert.equal(await page.locator('.replay-links button:disabled').count(), 3);
    }
    await page.goto(base + '#/models');
    const help = page.getByRole('button', { name: '模型设计说明', exact: true });
    await help.click();
    await page.getByRole('tooltip').waitFor();
    assert.equal(new URL(page.url()).hash, '#/models', 'Short help keeps the current page');
    await help.click();
    assert.equal(await page.getByRole('tooltip').count(), 0, 'A second click dismisses short help');
    await help.click();
    await page.getByRole('tooltip').waitFor();
    await page.getByRole('heading', { name: '异常检测模型', exact: true }).click();
    assert.equal(await page.getByRole('tooltip').count(), 0, 'Outside clicks dismiss short help');
    await help.focus();
    await page.getByRole('tooltip').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    assert.equal(await help.evaluate((element) => element === document.activeElement), true);
    if (width <= 390) {
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      await help.click();
      const tip = await page.getByRole('tooltip').boundingBox();
      assert.ok(tip.x >= 0 && tip.x + tip.width <= width && tip.height <= 844);
      await page.screenshot({ path: out + '/' + width + '-help-200.png' });
      await page.keyboard.press('Escape');
      await page.evaluate(() => (document.documentElement.style.zoom = ''));
    }
    await page.getByRole('link', { name: /^模型说明：/ }).click();
    await page.locator('#note-model-design:focus').waitFor();
    await page.locator('#note-model-design .note-return').click();
    await page.locator('#ref-models-model-design:focus').waitFor();
    checks.push({
      width,
      chart,
      trainingRangeIndependent: true,
      mseRoundTrip: true,
      tableHint: true,
      contextHelpAndMethodLinks: true,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(out + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(
    'PASS manifest failure/retry, training MSE notes, independent selection, mobile controls and table hints',
  );
} finally {
  await browser.close();
}
