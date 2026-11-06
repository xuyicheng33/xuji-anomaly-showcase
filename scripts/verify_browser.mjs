import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const remote = process.argv.includes('--remote');
if (process.env.SHOWCASE_URL && !remote)
  throw new Error('Release verification uses local dist. Use npm run test:site for another URL.');
if (remote && !process.env.SHOWCASE_URL)
  throw new Error('Set SHOWCASE_URL when running npm run test:site.');
const base = remote ? process.env.SHOWCASE_URL : 'http://127.0.0.1:4175/';
const output = process.env.QA_DIR || '.qa/verification';
const build = remote ? null : JSON.parse(await readFile('.qa/build.json', 'utf8'));
let server;
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
      { stdio: 'inherit', windowsHide: true },
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Preview server exited before startup.');
      try {
        ready = (await fetch(base)).ok;
      } catch {
        /* Wait for preview startup. */
      }
      if (ready) break;
      await setTimeout(100);
    }
    if (!ready) throw new Error('Preview server did not become ready.');
  }
  for (const name of [
    'report',
    'calculation',
    'loading',
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
          env: {
            ...process.env,
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
  server?.kill();
}
