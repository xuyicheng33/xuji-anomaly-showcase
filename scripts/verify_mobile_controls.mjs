import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';

const out = qaDirectory('mobile_controls');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await page.goto(showcaseUrl + '#/playback');
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
    await page.close();
    console.log(
      `PASS ${width}px: picker layering, sticky pause, detail headings and 200% viewport`,
    );
  }
} finally {
  await browser.close();
}
