import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], {
  encoding: 'utf8',
  timeout: 120_000,
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);

const report = JSON.parse(result.stdout);
if (report.auditReportVersion !== 2 || !report.vulnerabilities || report.error) {
  throw new Error('npm audit did not return a complete vulnerability report.');
}

const findings = Object.values(report.vulnerabilities);
if (result.status === 0 && findings.length === 0) {
  console.log('Full npm dependency audit passed.');
} else {
  // npm also reports each dependent package. The advisory objects identify the root causes.
  const advisories = findings.flatMap(({ via }) => via.filter((item) => typeof item !== 'string'));
  const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const temporaryException =
    result.status === 1 &&
    advisories.length > 0 &&
    advisories.every(
      ({ name, url }) =>
        name === 'picomatch' && url === 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
    ) &&
    report.vulnerabilities.picomatch?.nodes.length > 0 &&
    report.vulnerabilities.picomatch.nodes.every(
      (path) => packages[path]?.dev === true && packages[path].version === '4.0.7',
    );

  if (temporaryException) {
    console.warn(
      '::warning title=Temporary dependency exception::GHSA-fc5q-39xc-vjpf affects dev-only picomatch 4.0.7. Remove this exception when a patched upstream release is available.',
    );
  } else {
    console.error(result.stdout);
    process.exitCode = 1;
  }
}
