import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl } from './browser.mjs';

const out = process.env.QA_DIR || '.qa/mobile-controls';
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
    await page.close();
    console.log(
      `PASS ${width}px: picker layering, sticky pause, detail headings and 200% viewport`,
    );
  }
} finally {
  await browser.close();
}
