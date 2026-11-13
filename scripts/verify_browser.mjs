import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { browserOptions } from './browser.mjs';

const remote = process.argv.includes('--remote');
if (process.env.SHOWCASE_URL && !remote)
  throw new Error('Release verification uses local dist. Use npm run test:site for another URL.');
if (remote && !process.env.SHOWCASE_URL)
  throw new Error('Set SHOWCASE_URL when running npm run test:site.');
const base = remote ? process.env.SHOWCASE_URL : 'http://127.0.0.1:4175/';
const output = process.env.QA_DIR || '.qa/verification';
const build = remote ? null : JSON.parse(await readFile('.qa/build.json', 'utf8'));
let server, browser;
try {
  if (!remote) {
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4175',
        '--strictPort',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    await new Promise((resolve, reject) => {
      let started = false;
      let output = '';
      const timeout = setTimeout(() => {
        reject(new Error('Preview server did not announce startup.'));
      }, 10000);
      const failed = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      server.stdout.on('data', (chunk) => {
        process.stdout.write(chunk);
        output += chunk.toString();
        if (output.includes(base)) {
          started = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      server.stderr.on('data', (chunk) => process.stderr.write(chunk));
      server.once('error', failed);
      server.once('exit', (code) => {
        if (!started) failed(new Error(`Preview server exited before startup (${code}).`));
      });
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Preview server exited before startup.');
      try {
        ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
      } catch {
        /* Wait for preview startup. */
      }
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error('Preview server did not become ready.');
  }
  browser = await chromium.launchServer(browserOptions());
  for (const name of [
    'report',
    'calculation',
    'loading',
    'http_cache',
    'acceptance',
    'usability',
    'playback_scale',
    'contributions',
    'feature_picker',
    'mobile_controls',
    'ranges',
    'wind',
    'wind_ranges',
    'release',
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [`scripts/verify_${name === 'wind_ranges' ? 'ranges' : name}.mjs`],
        {
          stdio: 'inherit',
          windowsHide: true,
          timeout: 600000,
          env: {
            ...process.env,
            SHOWCASE_BROWSER_WS: browser.wsEndpoint(),
            SHOWCASE_URL: name === 'wind_ranges' ? new URL('?dataset=wind', base).href : base,
            SHOWCASE_DATASET: name === 'wind_ranges' ? 'wind' : 'converter',
            QA_DIR: path.join(output, name),
          },
        },
      );
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`)),
      );
    });
  }
  if (build) await writeFile('.qa/browser.json', JSON.stringify(build) + '\n');
} finally {
  await browser?.close();
  server?.kill();
}
