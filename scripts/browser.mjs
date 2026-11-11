import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

export const showcaseUrl = process.env.SHOWCASE_URL || 'http://127.0.0.1:4175/';

/** Browser checks use shipped rows; Python verification compares them to the originals. */
export async function readInput(folder, data) {
  const parts = await Promise.all(
    data.inputRowHashes.map((_, index) =>
      readFile(`${folder}/input-rows-v2/${data.input.sha256}/${index * data.inputChunkRows}.bin`),
    ),
  );
  return Buffer.concat(parts);
}

/** Explicit override, system Edge on Windows, or Playwright's installed Chromium. */
export function browserOptions() {
  const edge = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  return {
    executablePath: process.env.BROWSER_EXECUTABLE || edge,
    headless: true,
  };
}

export async function launchBrowser() {
  const browser = process.env.SHOWCASE_BROWSER_WS
    ? await chromium.connect(process.env.SHOWCASE_BROWSER_WS)
    : await chromium.launch(browserOptions());
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    page.setDefaultTimeout(Number(process.env.BROWSER_TIMEOUT || 60000));
    return page;
  };
  return browser;
}

/** Exercise the same searchable picker used by keyboard and touch users. */
export async function selectFeature(page, value, name = '选择测点') {
  const trigger = page.getByRole('button', { name, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: `${name}列表`, exact: true });
  await dialog.locator(`.feature-option[data-value="${value}"]`).click();
  await dialog.waitFor({ state: 'hidden' });
}

export function featureValue(page, name = '选择测点') {
  return page.getByRole('button', { name, exact: true }).getAttribute('data-value');
}
