import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';

const out = qaDirectory('mobile_controls');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(showcaseUrl + '#/playback');
    await page.getByRole('slider', { name: '播放进度' }).fill('132');
    await page.getByTestId('contribution-total').waitFor();
    if (width <= 390) {
      await page.getByRole('button', { name: '下一处检出', exact: true }).click();
      await page.waitForFunction(() => {
        const status = document.querySelector('.playback-status').getBoundingClientRect();
        const controls = document.querySelector('.playback-controls').getBoundingClientRect();
        return status.top >= controls.bottom && status.bottom < innerHeight;
      });
      const wrapped = await page.locator('.replay-links button').evaluateAll((buttons) =>
        buttons.some((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          return (
            range.getBoundingClientRect().height >
            parseFloat(getComputedStyle(button).lineHeight) + 1
          );
        }),
      );
      assert.equal(wrapped, false, 'Outcome jump labels stay on one line');
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      await page.waitForFunction(() => {
        const svg = document.querySelector('.reconstruction-view svg');
        return Math.abs(svg.getBoundingClientRect().width / 2 - svg.viewBox.baseVal.width) < 1;
      });
      const font = await page
        .locator('.reconstruction-view svg text')
        .first()
        .evaluate((text) => parseFloat(getComputedStyle(text).fontSize) * text.getScreenCTM().a);
      assert.ok(font >= 24, 'Chart tick text enlarges with the page at 200%');
      await page.evaluate(() => (document.documentElement.style.zoom = ''));
      await page.goto(showcaseUrl + '#/');
      await page.locator('.hero-title').waitFor();
      const title = await page.locator('.hero-title').evaluate((element) => {
        const tops = [...element.children].map((word) => word.getBoundingClientRect().top);
        return new Set(tops).size;
      });
      assert.equal(title, 1, 'The mobile hero title fits without orphan characters');
    }
    if (width === 768) {
      assert.ok((await page.locator('.site-header').boundingBox()).height <= 110);
    }
    if (width >= 768) {
      const plot = await page.locator('.playback-plots').boundingBox();
      const stats = await page.locator('.playback-statistics').boundingBox();
      assert.ok(stats.x >= plot.x + plot.width, 'Replay charts and results sit side by side');
      assert.ok(Math.abs(stats.y - plot.y) < 2, 'Replay panels align at the top');
      if (width === 1440) assert.ok(Math.abs(stats.height - plot.height) < 100);
    }
    await page.goto(showcaseUrl + '#/detection');
    await page.getByRole('button', { name: /查看模型结果/ }).click();
    await page.getByTestId('calculated-score').waitFor();
    const plot = await page.locator('.reconstruction-view svg').boundingBox();
    const summary = await page.locator('.detection-summary').boundingBox();
    assert.ok(summary.y >= plot.y + plot.height, 'The result summary follows its chart');
    if (width <= 390)
      assert.ok(plot.y < 760, 'The mobile chart is visible within the first screen');
    await page.goto(showcaseUrl + '#/training');
    const training = page.getByRole('img', { name: '归一化训练数据', exact: true });
    await training.waitFor();
    await page.waitForFunction(() => !!document.querySelector('.curve-selection'));
    const fraction = await training.evaluate((element) => {
      const selection = element.querySelector('.curve-selection');
      return Number(selection.getAttribute('width')) / element.viewBox.baseVal.width;
    });
    assert.ok(
      width <= 390 ? fraction > 0.45 : fraction < 0.4,
      'The mobile training window stays prominent',
    );
    await page.close();
  }
  console.log(
    'PASS compact header, aligned replay panels, visible mobile detection and focused training window',
  );
  const tablet = await browser.newPage({
    viewport: { width: 900, height: 900 },
    reducedMotion: 'reduce',
  });
  await tablet.goto(showcaseUrl + '#/playback');
  await tablet.getByRole('slider', { name: '播放进度' }).fill('132');
  await tablet.getByTestId('contribution-total').waitFor();
  await tablet.locator('.contribution-heading').scrollIntoViewIfNeeded();
  await tablet.locator('.contribution-row').first().click();
  await tablet.getByTestId('sensor-mean-error').waitFor();
  await tablet.waitForFunction(() => {
    const heading = document.querySelector('.sensor-detail-heading').getBoundingClientRect();
    return heading.top >= 0 && heading.bottom <= innerHeight;
  });
  await tablet.getByRole('button', { name: '收起明细', exact: true }).click();
  await tablet.waitForFunction(() => {
    const row = document.querySelector('.contribution-row');
    const box = row.getBoundingClientRect();
    return row === document.activeElement && box.top >= -1 && box.bottom <= innerHeight;
  });
  await tablet.close();
  console.log('PASS tablet contribution detail stays visible and returns to its origin');

  for (const width of [390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(showcaseUrl + '#/playback');
    const controlHeights = await page
      .locator('.playback-transport button, .playback-controls select')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    assert.ok(Math.max(...controlHeights) - Math.min(...controlHeights) <= 1);
    await page.getByRole('slider', { name: '播放进度' }).fill('132');
    await page.getByTestId('contribution-total').waitFor();
    await page.getByRole('button', { name: '选择测点', exact: true }).click();
    const cancel = page.getByRole('button', { name: '取消', exact: true });
    const box = await cancel.boundingBox();
    assert.equal(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.textContent?.includes('取消'),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
      true,
    );
    await cancel.click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('[aria-label="播放进度"]').value) > 132,
    );
    await page.locator('.contribution-heading').scrollIntoViewIfNeeded();
    const pause = page.getByRole('button', { name: '暂停', exact: true });
    const pauseBox = await pause.boundingBox();
    assert.ok(pauseBox.y >= 0 && pauseBox.y + pauseBox.height < 160);
    await pause.click();
    const count = await page.getByRole('slider', { name: '播放进度' }).inputValue();
    await page.waitForTimeout(180);
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), count);
    await page.screenshot({ path: `${out}/${width}-controls.png` });
    await page.locator('.contribution-row').first().click();
    await page.getByTestId('sensor-mean-error').waitFor();
    await page.waitForFunction(() => {
      const heading = document.querySelector('.sensor-detail-heading').getBoundingClientRect();
      const bar = document.querySelector('.playback-controls').getBoundingClientRect();
      return heading.top >= bar.bottom;
    });
    await page.screenshot({ path: `${out}/${width}-detail.png` });
    await page.getByRole('button', { name: '收起明细', exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.playback-controls')).position === 'static',
    );
    await page.evaluate(() => {
      document.documentElement.style.zoom = '';
    });
    await page.goto(showcaseUrl + '#/detection');
    await page.getByRole('button', { name: /查看模型结果/ }).click();
    await page.getByTestId('calculated-score').waitFor();
    const table = page.locator('.calculation-table-scroll');
    await table.scrollIntoViewIfNeeded();
    await table.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = 90;
    });
    await page.waitForFunction(() => {
      const scroller = document.querySelector('.calculation-table-scroll');
      const box = scroller.getBoundingClientRect();
      const row = [...scroller.querySelectorAll('tbody th')].find((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.top > box.top + 45 && rect.bottom < box.bottom;
      });
      if (!row) return false;
      const cell = row.getBoundingClientRect();
      const corner = scroller.querySelector('thead th').getBoundingClientRect();
      const hit = document.elementFromPoint(cell.x + 10, cell.y + 10);
      return (
        Math.abs(cell.left - box.left) < 2 &&
        Math.abs(corner.left - box.left) < 2 &&
        row.contains(hit)
      );
    });
    await page.screenshot({ path: `${out}/${width}-calculation-right.png` });
    await page.goto(showcaseUrl + '#/training');
    await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => (document.documentElement.style.zoom = '2'));
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Training must reflow at ${width}px and 200% zoom`,
    );
    await page.screenshot({ path: `${out}/${width}-training-200.png` });
    for (const query of ['', '?dataset=wind']) {
      await page.goto(showcaseUrl + query + '#/');
      await page.locator('main h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Home must reflow at ${width}px and 200% zoom (${query || 'converter'})`,
      );
      await page.goto(showcaseUrl + query + '#/data');
      await page.locator('.normalization-section').scrollIntoViewIfNeeded();
      await page.locator('.normalization-facts').waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Data must reflow at ${width}px and 200% zoom (${query || 'converter'})`,
      );
      if (!query) {
        const comparison = page.getByRole('region', {
          name: '缺失值填零前后对照，可左右滚动',
        });
        await comparison.evaluate((element) => (element.scrollLeft = element.scrollWidth));
        assert.ok(await comparison.evaluate((element) => element.scrollLeft > 0));
      }
      await page.screenshot({
        path: `${out}/${width}-${query ? 'wind' : 'converter'}-data-200.png`,
      });
    }
    await page.close();
    console.log(
      `PASS ${width}px: picker layering, sticky pause, detail headings and 200% viewport`,
    );
  }
} finally {
  await browser.close();
}
