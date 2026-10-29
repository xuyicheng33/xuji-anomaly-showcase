import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';

const base = process.env.SHOWCASE_URL || 'http://127.0.0.1:4175/';
const output = process.env.QA_DIR || '.qa/verification';
let server;
try {
  if (!process.env.SHOWCASE_URL) {
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
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`scripts/verify_${name}.mjs`], {
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, SHOWCASE_URL: base, QA_DIR: path.join(output, name) },
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`)),
      );
    });
  }
} finally {
  server?.kill();
}
