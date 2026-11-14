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
      await page.locator('.window-reconstruction-plot svg[role="group"]').waitFor();
      await page.waitForFunction(() => {
        const svg = document.querySelector('.window-reconstruction-plot svg[role="group"]');
        return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width) < 1;
      });
      const font = await page
        .locator('.window-reconstruction-plot svg[role="group"] text')
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
          const svg = document.querySelector('.case-stage .curve svg[role="img"]');
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
      await page
        .getByRole('navigation', { name: '章节衔接' })
        .getByRole('link', { name: /下一章/ })
        .click();
      await page.getByRole('heading', { name: '检测结果回放', exact: true }).waitFor();
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '345');
      const plot = await page.locator('.playback-plots').boundingBox();
      const stats = await page.locator('.playback-statistics').boundingBox();
      if (width === 768) {
        assert.ok(plot.width >= 700 && stats.y >= plot.y + plot.height);
      }
      if (width <= 390) {
        const field = await page.locator('.feature-field').boundingBox();
        const label = await page.locator('.feature-field > span').boundingBox();
        const trigger = await page.locator('.feature-trigger').boundingBox();
        assert.ok(label.x + label.width <= trigger.x, 'The field label precedes its control');
        assert.ok(Math.abs(trigger.x + trigger.width - field.x - field.width) < 1);
        assert.ok(trigger.height >= 44, 'The compact picker retains its touch target');
      }
      await page.waitForFunction(() => {
        const table = document.querySelector('[aria-describedby="playback-table-hint"]');
        const hint = document.getElementById('playback-table-hint');
        return hint.hidden === table.scrollWidth <= table.clientWidth + 1;
      });
      await page.getByRole('combobox', { name: '播放范围' }).selectOption('window');
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '0');
      assert.match(await page.locator('.playback-scope').innerText(), /第 108—171 点/);
      assert.match(await page.locator('.playback-scope').innerText(), /\d{4}-\d{2}-\d{2}/);
      await page.evaluate(() => scrollTo(0, 0));
      await page.getByRole('button', { name: '切换数据集', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('navigation', { name: '数据集', exact: true }).count(), 0);
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      if (width <= 390) {
        const links = page.locator('.chapter-navigation a');
        const previous = await links.first().boundingBox();
        const next = await links.last().boundingBox();
        assert.ok(next.y >= previous.y + previous.height);
      }
      if (dataset === 'converter') {
        await page.locator('.model-select button').last().click();
        await page.waitForFunction(() => {
          const selected = document.querySelector('.model-select [aria-pressed=true]');
          const indicator = document.querySelector('.selection-indicator');
          const button = selected.getBoundingClientRect();
          const highlight = indicator.getBoundingClientRect();
          return (
            Math.abs(button.y - highlight.y) < 1 && Math.abs(button.height - highlight.height) < 1
          );
        });
        assert.ok(
          await page.locator('.model-select button').evaluateAll((buttons) =>
            buttons.every((button) => {
              const range = document.createRange();
              range.selectNodeContents(button);
              const text = range.getBoundingClientRect();
              const box = button.getBoundingClientRect();
              return text.x >= box.x && text.right <= box.right;
            }),
          ),
          'Model names must remain inside their controls at 200% zoom',
        );
      }
      await page.getByRole('button', { name: '切换数据集', exact: true }).click();
      const menu = await page
        .getByRole('navigation', { name: '数据集', exact: true })
        .boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
      await page.keyboard.press('Escape');
      await page.evaluate(() => (document.documentElement.style.zoom = ''));
      await page.getByRole('button', { name: '切换数据集', exact: true }).click();
      await page.locator('.dataset-options a:not([aria-current])').click();
      await page.locator('.playback-page[data-curves-ready=true]').waitFor();
      assert.equal(new URL(page.url()).hash, '#/playback');
      assert.equal(await page.getByRole('slider', { name: '播放进度' }).inputValue(), '0');
      assert.equal(
        await page.locator('.dataset-trigger').innerText(),
        dataset === 'wind' ? '换流设备' : '风电设备',
      );
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
