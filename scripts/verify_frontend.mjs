import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, showcaseUrl, qaDirectory } from './browser.mjs';

const out = qaDirectory('frontend');
await mkdir(out, { recursive: true });
const browser = await launchBrowser();
try {
  for (const dataset of ['converter', 'wind']) {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      const url = new URL(showcaseUrl);
      url.searchParams.set('dataset', dataset);
      const go = async (chapter) => {
        url.hash = '/' + chapter;
        await page.goto(url.href);
        await page.locator('h1:visible').waitFor();
      };
      const navigate = async (name) => {
        if (width <= 680) await page.getByRole('button', { name: '目录', exact: true }).click();
        await page
          .getByRole('navigation', { name: '章节导航' })
          .getByRole('link', { name, exact: true })
          .click();
        await page.locator('h1:visible').waitFor();
      };
      await go('training');
      await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
      await page.getByRole('slider', { name: '训练窗口位置' }).fill('320');
      await page.getByRole('slider', { name: '训练轮次' }).fill('3');
      await navigate('片段检测');
      await page.goBack();
      await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
      assert.equal(await page.getByRole('slider', { name: '训练窗口位置' }).inputValue(), '320');
      assert.equal(await page.getByRole('slider', { name: '训练轮次' }).inputValue(), '3');
      await go('playback');
      await page.getByRole('slider', { name: '播放进度' }).fill('345');
      await page.getByRole('combobox', { name: '播放速度' }).selectOption('8');
      await navigate('片段检测');
      await page.goBack();
      await page.getByRole('slider', { name: '播放进度' }).waitFor();
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '345');
      assert.equal(await page.getByRole('combobox', { name: '播放速度' }).inputValue(), '8');
      assert.equal(await page.getByRole('button', { name: '播放', exact: true }).count(), 1);
      await page.locator('button.contribution-row').first().click();
      await page.locator('.window-reconstruction-plot svg').waitFor();
      await page.waitForFunction(() => {
        const svg = document.querySelector('.window-reconstruction-plot svg');
        return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1;
      });
      const font = await page
        .locator('.window-reconstruction-plot svg text')
        .first()
        .evaluate((text) => {
          const svg = text.ownerSVGElement;
          return (
            (parseFloat(getComputedStyle(text).fontSize) * svg.getBoundingClientRect().width) /
            svg.viewBox.baseVal.width
          );
        });
      assert.ok(font >= 12);
      await page.screenshot({ path: `${out}/${dataset}-${width}-detail.png` });
      await go('anomalies');
      await page.locator('.case-stage').waitFor();
      for (const point of [0, 30, 63]) {
        await page.getByRole('slider', { name: '案例查看时刻' }).fill(String(point));
        await page.waitForFunction(() => {
          const svg = document.querySelector('.case-stage .curve svg');
          const circle = svg.querySelector('circle').getBoundingClientRect();
          const label = document
            .querySelector('.case-label-cells [aria-pressed=true]')
            .getBoundingClientRect();
          return Math.abs(circle.x + circle.width / 2 - label.x - label.width / 2) < 1;
        });
      }
      await page.screenshot({ path: `${out}/${dataset}-${width}-anomalies.png`, fullPage: true });
      await navigate('模型训练');
      await page.goBack();
      await page.locator('.case-stage').waitFor();
      assert.equal(await page.getByRole('slider', { name: '案例查看时刻' }).inputValue(), '63');
      await go('detection');
      const input = page.getByRole('spinbutton', { name: '片段起点' });
      await input.fill('99999');
      await input.blur();
      await page.locator('#start-input-hint[role=alert]').waitFor();
      assert.equal(await input.inputValue(), '99999');
      assert.equal(await page.locator('.selection-panel .primary').isDisabled(), true);
      await input.fill('108');
      await input.press('Enter');
      assert.equal(await input.getAttribute('aria-invalid'), null);
      await page.locator('.selection-panel .primary').click();
      await page.getByTestId('calculated-score').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${dataset}-${width}-detection.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS ${dataset} ${width}: chapter state, invalid input, label alignment and readable detail`,
      );
    }
  }
} finally {
  await browser.close();
}
