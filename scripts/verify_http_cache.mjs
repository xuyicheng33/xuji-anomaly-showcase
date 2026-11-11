import { qaDirectory } from './browser.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser } from './browser.mjs';

// Playwright routing disables the HTTP cache, so this regression needs a real server.
const root = path.resolve('dist');
const output = qaDirectory('http_cache');
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
let corruptPath,
  reads = 0;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('Unexpected path');
    let body = await readFile(file);
    if (pathname === corruptPath && ++reads === 1) {
      body = Buffer.from(body);
      if (file.endsWith('.json')) body = Buffer.from('{');
      else body[0] ^= 1;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': body.length,
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser();
const checks = [];
try {
  for (const [dataset, folder] of [
    ['converter', 'journey'],
    ['wind', 'wind'],
  ]) {
    const manifest = JSON.parse(await readFile(`dist/data/${folder}/manifest.json`, 'utf8'));
    for (const kind of ['binary', 'json']) {
      corruptPath =
        `/data/${folder}/` +
        (kind === 'binary' ? `curves-v1/${manifest.datasets.train.sha256}/5.bin` : 'manifest.json');
      reads = 0;
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}?dataset=${dataset}#/training`);
      await page.getByRole('alert').waitFor();
      const requested = await page.evaluate(
        (pathname) =>
          performance
            .getEntriesByType('resource')
            .find((entry) => new URL(entry.name).pathname === pathname)?.name,
        corruptPath,
      );
      assert.ok(requested);
      await page.evaluate(
        (url) => fetch(url).then((response) => response.arrayBuffer()),
        requested,
      );
      assert.equal(reads, 1, 'The test must reproduce a real cached bad response');
      await page.getByRole('button', { name: '重新读取', exact: true }).click();
      await page.getByRole('img', { name: '归一化训练数据', exact: true }).waitFor();
      assert.equal(reads, 2, 'Retry must fetch verified bytes over the network');
      assert.deepEqual(errors, []);
      checks.push({ dataset, kind, badResponseCached: true, retryNetworkReads: reads });
      await page.close();
    }
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/cache-checks.json`, JSON.stringify(checks, null, 2));
  console.log('PASS real immutable HTTP cache: corrupt binary and JSON recover in both datasets');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
