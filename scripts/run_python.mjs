import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Prefer the pinned local environment; CI uses setup-python without a virtualenv.
const environment = path.resolve(
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const command = process.env.SHOWCASE_PYTHON || (existsSync(environment) ? environment : 'python');
const args = process.argv.slice(2);
const publicOnly = args.includes('--public-only');
const result = spawnSync(
  command,
  ['-X', 'utf8', '-B', ...args.filter((arg) => arg !== '--public-only')],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...(publicOnly ? { SHOWCASE_PUBLIC_ONLY: '1' } : {}) },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
