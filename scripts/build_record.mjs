import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const tracked = [
  ...new Set(git('ls-files', '-c', '-o', '--exclude-standard', '-z').split('\0').filter(Boolean)),
].sort();
const source = createHash('sha256');
for (const name of tracked) {
  // git ls-files also lists tracked paths deleted in the working copy.
  try {
    source.update(name + '\0' + digest(name));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const sourceHash = source.digest('hex');
const commit = git('rev-parse', 'HEAD');
const files = {};
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (!file.endsWith('.gz'))
      files[path.relative('dist', file).replaceAll('\\', '/')] = digest(file);
  }
}
walk('dist');
const recordPath = '.qa/build.json';
const mode = process.argv[2];
if (mode === 'verify') {
  const build = JSON.parse(readFileSync(recordPath, 'utf8'));
  if (
    build.sourceHash !== sourceHash ||
    build.commit !== commit ||
    JSON.stringify(build.files) !== JSON.stringify(files)
  ) {
    throw new Error(
      'Source or production files changed after the build. Run npm run verify again.',
    );
  }
}
mkdirSync('.qa', { recursive: true });
writeFileSync(
  recordPath,
  JSON.stringify({ commit, sourceHash, files, verified: mode === 'verify' }, null, 2) + '\n',
);
console.log(
  `Recorded ${mode === 'verify' ? 'verified' : 'built'} release ${commit.slice(0, 7)} (${Object.keys(files).length} files).`,
);
