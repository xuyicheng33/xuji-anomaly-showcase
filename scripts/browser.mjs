import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

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
  const browser = await chromium.launch(browserOptions());
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    page.setDefaultTimeout(Number(process.env.BROWSER_TIMEOUT || 60000));
    return page;
  };
  return browser;
}
