"""Publish the verified build to the dedicated 9010 site, preserving rollback."""
import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tarfile
import sys
from textwrap import dedent

import paramiko

from dataset_paths import DATASETS
from release_files import hashes
from release_validation import validate_evaluation, site_config, fallback_release

SITE = '/var/www/xuji-showcase'
CONFIG = '/etc/nginx/conf.d/xuji-showcase-9010.conf'
URL = 'http://124.223.175.32:9010/'


def run(client, command):
    _, stdout, stderr = client.exec_command(command, timeout=120)
    output = stdout.read().decode()
    error = stderr.read().decode()
    status = stdout.channel.recv_exit_status()
    if status:
        raise RuntimeError(f'Command failed ({status}): {error}\n{output}')
    return output


def remote_python(client, source, *, sudo=False):
    prefix = 'sudo -n ' if sudo else ''
    return run(client, prefix + 'python3 -B -c ' + shlex.quote(dedent(source)))


def release_call(client, staging, function, *args):
    return remote_python(client, f'''
        import sys
        sys.path.insert(0, {staging!r})
        import release_files
        release_files.{function}(*{args!r})
    ''', sudo=True)


@contextmanager
def deployment_lock(client):
    """The remote OS releases this lock if the SSH session disappears."""
    source = dedent(f'''
        import fcntl, sys
        with open({SITE + '/.deploy.lock'!r}, 'a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                sys.exit('Another deployment owns the dedicated 9010 site')
            print('locked', flush=True)
            sys.stdin.read()
    ''')
    stdin, stdout, stderr = client.exec_command('sudo -n python3 -u -B -c ' + shlex.quote(source), timeout=20)
    try:
        if stdout.readline().strip() != 'locked':
            raise RuntimeError(stderr.read().decode() or 'Could not acquire deployment lock')
        yield
    finally:
        stdin.channel.shutdown_write()
        stdout.channel.close()


def cleanup(action, description):
    """A cleanup failure must not replace the original deployment error."""
    try:
        action()
    except Exception as error:
        print(f'{description}: {error}', file=sys.stderr, flush=True)


def activate(client, staging, target, previous, backup, config_digest, probes, verify=None):
    configured = switched = False
    try:
        release_call(client, staging, 'install_config', CONFIG, backup,
                     staging + '/site.conf', config_digest)
        configured = True
        run(client, 'sudo -n nginx -t')
        release_call(client, staging, 'switch_release', SITE + '/current', target, previous)
        switched = True
        run(client, 'sudo -n systemctl reload nginx')
        if run(client, 'curl -fsS --max-time 20 -o /dev/null -w "%{http_code}" http://127.0.0.1:9010/') != '200':
            raise RuntimeError('Released home page did not return 200')
        for relative in probes:
            remote_python(client, f'''
                from urllib.request import Request, urlopen
                from pathlib import Path
                request = Request('http://127.0.0.1:9010/' + {relative!r},
                                  headers={{'Range': 'bytes=0-31999', 'Accept-Encoding': 'gzip'}})
                with urlopen(request, timeout=20) as response:
                    assert response.status == 206 and response.headers.get('Content-Encoding') is None
                    assert response.read() == (Path({target!r}) / {relative!r}).read_bytes()[:32000]
            ''')
        if verify is not None:
            verify()
    except BaseException as failure:
        try:
            if switched:
                release_call(client, staging, 'switch_release', SITE + '/current', previous, target)
            if configured:
                release_call(client, staging, 'restore_config', CONFIG, backup)
                run(client, 'sudo -n nginx -t')
                run(client, 'sudo -n systemctl reload nginx')
        except Exception as rollback_error:
            failure.add_note(f'Rollback also failed: {rollback_error}')
        raise


def publish(client, root, output, commit, records, scope, verify=None):
    with deployment_lock(client):
        publish_locked(client, root, output, commit, records, scope, verify)


def publish_locked(client, root, output, commit, records, scope, verify=None):
    release = commit[:7]
    operation = release + '-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')
    previous = run(client, 'readlink -f ' + SITE + '/current').strip()
    old = json.loads(remote_python(client, f'''
        from pathlib import Path
        import hashlib, json
        folder = Path({previous!r})
        print(json.dumps({{p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in folder.rglob('*') if p.is_file() and p.suffix != '.gz'}}))
    '''))
    changed = [name for name, digest in records.items() if old.get(name) != digest]
    archive = output / ('release-' + operation + '.tar.gz')
    with tarfile.open(archive, 'w:gz') as package:
        for name in changed:
            package.add(root / 'dist' / name, arcname=name)
    upload_bytes = archive.stat().st_size
    print(json.dumps({'release': release, 'changedFiles': len(changed), 'uploadBytes': upload_bytes}), flush=True)
    staging = '/home/ubuntu/xuji-home-data-' + operation
    target = SITE + '/releases/' + release
    run(client, 'mkdir -p ' + shlex.quote(staging))
    try:
        existing = remote_python(client, f'from pathlib import Path; print(Path({CONFIG!r}).read_text(), end="")')
        config = (root / 'deploy/nginx-9010.conf').read_text(encoding='utf8')
        fallback = fallback_release(existing, previous, target)
        updated = site_config(existing, config, fallback)
        probes = []
        for _, public in DATASETS.values():
            name = public.name
            manifest = json.loads((root / 'dist/data' / name / 'manifest.json').read_text(encoding='utf8'))
            probes.append('data/' + name + '/' + manifest['models'][0]['windows']['chunks'][0]['file'])
        with client.open_sftp() as sftp:
            sftp.put(str(root / 'scripts/release_files.py'), staging + '/release_files.py')
            sftp.put(str(archive), staging + '/changes.tar.gz')
            for name, content in [('files.json', json.dumps(records)), ('site.conf', updated)]:
                with sftp.open(staging + '/' + name, 'w') as file:
                    file.write(content)
        release_call(client, staging, 'prepare_staged', previous, target, staging, changed)
        backup = SITE + '/config-backups/' + operation + '.conf'
        retained_backup = remote_python(client, f'''
            import sys
            sys.path.insert(0, {staging!r})
            from release_files import rollback_config
            print(rollback_config({SITE!r}, {previous!r}, {target!r}, {fallback!r}, {backup!r}))
        ''', sudo=True).strip()
        if not retained_backup:
            raise RuntimeError('Missing retained rollback configuration')
        activate(client, staging, target, previous, backup,
                 hashlib.sha256(existing.encode()).hexdigest(), probes, verify)
        result = {
            'release': release, 'previousRelease': Path(fallback).name,
            'url': URL, 'releasePath': target,
            'verifiedFiles': len(records), 'changedFiles': len(changed),
            'uploadedBytes': upload_bytes, 'scope': scope,
            'deployedAt': datetime.now(timezone.utc).isoformat(),
            'rollbackConfig': retained_backup,
        }
        release_call(client, staging, 'record_deployment', SITE, result)
        (output / 'deploy-result.json').write_text(json.dumps(result, indent=2), encoding='utf8')
        archive.unlink()
        print(json.dumps(result), flush=True)
        retention = release_call(client, staging, 'prune_releases', SITE, target, fallback, retained_backup)
        if retention.strip():
            print(retention.strip(), flush=True)
    finally:
        cleanup(lambda: remote_python(client, f'''
            from pathlib import Path
            import shutil
            folder = Path({staging!r}).resolve()
            assert folder.parent == Path('/home/ubuntu') and folder.name == {Path(staging).name!r}
            shutil.rmtree(folder)
        ''', sudo=True), 'Staging cleanup failed')
        cleanup(lambda: archive.unlink(missing_ok=True), 'Local release archive cleanup failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qa-dir', type=Path, default=Path('.qa/deployment'))
    parser.add_argument('--scope', default='Verified production release')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip():
        raise RuntimeError('Commit the release changes before deployment.')
    record = json.loads((root / '.qa/build.json').read_text(encoding='utf8'))
    if not record.get('verified') or record['commit'] != commit:
        raise RuntimeError('Run npm run verify on this commit before deployment.')
    subprocess.run(['node', 'scripts/build_record.mjs', 'check'], cwd=root, check=True)
    records = hashes(root / 'dist')
    if records != record['files']:
        raise RuntimeError('Production files differ from the verified build.')
    for reference, public in DATASETS.values():
        validate_evaluation(root / 'dist/data' / public.name, reference / 'manifest.json')
    output = args.qa_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with closing(paramiko.SSHClient()) as client:
        client.load_host_keys(str(Path.home() / '.ssh/known_hosts'))
        client.connect('124.223.175.32', username='ubuntu',
                       key_filename=str(Path.home() / '.ssh/xuji_showcase_ed25519'),
                       look_for_keys=False, allow_agent=False, timeout=20)
        def verify_site():
            subprocess.run(['node', 'scripts/verify_release.mjs'], cwd=root, check=True,
                           env={**os.environ, 'SHOWCASE_URL': URL, 'QA_DIR': str(output / 'browser')}, timeout=600)

        publish(client, root, output, commit, records, args.scope, verify_site)


if __name__ == '__main__':
    main()
