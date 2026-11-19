import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import path from 'node:path';

export const showcaseUrl = process.env.SHOWCASE_URL || 'http://127.0.0.1:4175/';
export const qaDirectory = (name) => process.env.QA_DIR || path.join('.qa', 'verification', name);

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
    if (process.env.SHOWCASE_LEGACY === '1') {
      const goto = page.goto.bind(page);
      page.goto = (url, ...options) => {
        const target = new URL(url);
        target.searchParams.set('version', 'legacy');
        return goto(target.href, ...options);
      };
    }
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

/** The point a case opens on: a nearly flat reference falls back to its most varied point. */
export function caseFeature(item, material, features = 125) {
  if (item.kind !== 'reference') return item.feature;
  const spread = (feature) => {
    let lo = Infinity,
      hi = -Infinity;
    for (let t = item.begin; t < item.end; t++) {
      const value = material[t * features + feature];
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
    return hi - lo;
  };
  if (spread(item.feature) >= 0.1) return item.feature;
  return item.features.reduce((best, f) => (spread(f) > spread(best) ? f : best), item.feature);
}

/** Typical points of the score page: strongest detection and false alarm, first miss and normal. */
export function typicalPoints(labels, scores, threshold) {
  const picks = new Map();
  for (let i = 0; i < scores.length; i++) {
    const alarm = scores[i] > threshold;
    const code = labels[i] > 0 ? (alarm ? 'tp' : 'fn') : alarm ? 'fp' : 'tn';
    const current = picks.get(code);
    if (current === undefined) picks.set(code, i);
    else if ((code === 'tp' || code === 'fp') && scores[i] > scores[current]) picks.set(code, i);
  }
  return ['tp', 'fp', 'fn', 'tn'].flatMap((code) =>
    picks.has(code) ? [{ code, index: picks.get(code) }] : [],
  );
}

/** The window the score page shows around a time point. */
export const windowAround = (index, window, times) =>
  Math.max(0, Math.min(times - window, index - (window >> 1)));

/** Moves the score page to the window starting at a zero-based position. */
export async function selectWindow(page, start) {
  await page.getByRole('slider', { name: /^选择 \d+ 点片段$/ }).fill(String(start));
}
