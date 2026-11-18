"""Publish the verified build to the dedicated 9010 site, preserving rollback."""

import argparse
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tarfile
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent

import paramiko
from data_archive import verify as verify_archive_data
from dataset_paths import DATASETS, retained_path
from release_validation import fallback_release, site_config, validate_evaluation
from result_catalog import results

SITE = "/var/www/xuji-showcase"
CONFIG = "/etc/nginx/conf.d/xuji-showcase-9010.conf"
URL = "http://124.223.175.32:9010/"


def run(client, command, *, input_text=None):
    stdin, stdout, stderr = client.exec_command(command, timeout=120)
    if input_text is not None:
        stdin.write(input_text.encode("utf8"))
        stdin.channel.shutdown_write()
    output = stdout.read().decode()
    error = stderr.read().decode()
    status = stdout.channel.recv_exit_status()
    if status:
        raise RuntimeError(f"Command failed ({status}): {error}\n{output}")
    return output


def remote_python(client, source, *, sudo=False):
    prefix = "sudo -n " if sudo else ""
    return run(client, prefix + "python3 -B -", input_text=dedent(source))


def release_call(client, staging, function, *args):
    return remote_python(
        client,
        f"""
        import sys
        sys.path.insert(0, {staging!r})
        import release_files
        release_files.{function}(*{args!r})
    """,
        sudo=True,
    )


@contextmanager
def deployment_lock(client):
    """The remote OS releases this lock if the SSH session disappears."""
    source = dedent(f"""
        import fcntl, sys
        with open({SITE + "/.deploy.lock"!r}, 'a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                sys.exit('Another deployment owns the dedicated 9010 site')
            print('locked', flush=True)
            sys.stdin.read()
    """)
    stdin, stdout, stderr = client.exec_command(
        "sudo -n python3 -u -B -c " + shlex.quote(source), timeout=20
    )
    try:
        if stdout.readline().strip() != "locked":
            raise RuntimeError(stderr.read().decode() or "Could not acquire deployment lock")
        yield
    finally:
        stdin.channel.shutdown_write()
        stdout.channel.close()


def cleanup(action, description):
    """A cleanup failure must not replace the original deployment error."""
    try:
        action()
    except Exception as error:
        print(f"{description}: {error}", file=sys.stderr, flush=True)


def activate(
    client, staging, target, previous, backup, config_digest, probes, verify=None, accepted=None
):
    configured = switched = False
    try:
        release_call(
            client, staging, "install_config", CONFIG, backup, staging + "/site.conf", config_digest
        )
        configured = True
        run(client, "sudo -n nginx -t")
        release_call(client, staging, "switch_release", SITE + "/current", target, previous)
        switched = True
        run(client, "sudo -n systemctl reload nginx")
        if (
            run(
                client,
                'curl -fsS --max-time 20 -o /dev/null -w "%{http_code}" http://127.0.0.1:9010/',
            )
            != "200"
        ):
            raise RuntimeError("Released home page did not return 200")
        for relative in probes:
            remote_python(
                client,
                f"""
                from urllib.request import Request, urlopen
                from pathlib import Path
                request = Request('http://127.0.0.1:9010/' + {relative!r},
                                  headers={{'Range': 'bytes=0-31999', 'Accept-Encoding': 'gzip'}})
                with urlopen(request, timeout=20) as response:
                    assert response.status == 206 and response.headers.get('Content-Encoding') is None
                    assert response.read() == (Path({target!r}) / {relative!r}).read_bytes()[:32000]
            """,
            )
        if verify is not None:
            verify()
        if accepted is not None:
            accepted()
    except BaseException as failure:
        try:
            if switched:
                release_call(client, staging, "switch_release", SITE + "/current", previous, target)
            if configured:
                release_call(client, staging, "restore_config", CONFIG, backup)
                run(client, "sudo -n nginx -t")
                run(client, "sudo -n systemctl reload nginx")
        except Exception as rollback_error:
            failure.add_note(f"Rollback also failed: {rollback_error}")
        raise


def publish(client, root, output, commit, records, scope, verify=None):
    with deployment_lock(client):
        publish_locked(client, root, output, commit, records, scope, verify)


def publish_locked(client, root, output, commit, records, scope, verify=None):
    release = commit[:7]
    operation = release + "-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    previous = run(client, "readlink -f " + SITE + "/current").strip()
    old = json.loads(
        remote_python(
            client,
            f"""
        from pathlib import Path
        import hashlib, json
        folder = Path({previous!r})
        files = {{}}
        for p in sorted(folder.rglob('*')):
            if p.is_file() and p.suffix != '.gz':
                with p.open('rb') as stream:
                    files[p.relative_to(folder).as_posix()] = hashlib.file_digest(stream, 'sha256').hexdigest()
        print(json.dumps(files))
    """,
        )
    )
    available = set(old.values())
    changed = [name for name, digest in records.items() if digest not in available]
    archive = output / ("release-" + operation + ".tar.gz")
    with tarfile.open(archive, "w:gz") as package:
        for name in changed:
            package.add(root / "dist" / name, arcname=name)
    upload_bytes = archive.stat().st_size
    print(
        json.dumps({"release": release, "changedFiles": len(changed), "uploadBytes": upload_bytes}),
        flush=True,
    )
    staging = "/home/ubuntu/xuji-home-data-" + operation
    target = SITE + "/releases/" + release
    run(client, "mkdir -p " + shlex.quote(staging))
    try:
        existing = remote_python(
            client, f'from pathlib import Path; print(Path({CONFIG!r}).read_text(), end="")'
        )
        config = (root / "deploy/nginx-9010.conf").read_text(encoding="utf8")
        fallback = fallback_release(existing, previous, target)
        updated = site_config(existing, config, fallback)
        probes = []
        for _, public in DATASETS.values():
            name = public.name
            manifest = json.loads(
                (root / "dist/data" / name / "manifest.json").read_text(encoding="utf8")
            )
            probes.append(
                "data/" + name + "/" + manifest["models"][0]["windows"]["chunks"][0]["file"]
            )
        for result in results(root):
            name = DATASETS[result["dataset"]][1].name
            manifest = json.loads(
                (root / "dist/data" / name / result["manifest"]["file"]).read_text(encoding="utf8")
            )
            probes.append(
                "data/" + name + "/" + manifest["models"][0]["windows"]["chunks"][0]["file"]
            )
        with client.open_sftp() as sftp:
            sftp.put(str(root / "scripts/release_files.py"), staging + "/release_files.py")
            sftp.put(str(archive), staging + "/changes.tar.gz")
            inventory = json.dumps({"next": records, "previous": old})
            for name, content in [("files.json", inventory), ("site.conf", updated)]:
                with sftp.open(staging + "/" + name, "w") as file:
                    file.write(content)
        release_call(client, staging, "prepare_staged", previous, target, staging, changed)
        backup = SITE + "/config-backups/" + operation + ".conf"
        retained_backup = remote_python(
            client,
            f"""
            import sys
            sys.path.insert(0, {staging!r})
            from release_files import rollback_config
            print(rollback_config({SITE!r}, {previous!r}, {target!r}, {fallback!r}, {backup!r}))
        """,
            sudo=True,
        ).strip()
        result = {
            "release": release,
            "previousRelease": Path(fallback).name,
            "url": URL,
            "releasePath": target,
            "verifiedFiles": len(records),
            "changedFiles": len(changed),
            "uploadedBytes": upload_bytes,
            "scope": scope,
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "rollbackConfig": retained_backup,
        }
        activate(
            client,
            staging,
            target,
            previous,
            backup,
            hashlib.sha256(existing.encode()).hexdigest(),
            probes,
            verify,
            lambda: release_call(client, staging, "record_deployment", SITE, result),
        )
        print(json.dumps(result), flush=True)
        cleanup(
            lambda: (output / "deploy-result.json").write_text(
                json.dumps(result, indent=2), encoding="utf8"
            ),
            f"Release {release} is live; local receipt could not be written",
        )
        cleanup(
            lambda: print(
                release_call(
                    client, staging, "prune_releases", SITE, target, fallback, retained_backup
                ).strip(),
                flush=True,
            ),
            f"Release {release} is live; retention cleanup failed",
        )
    finally:
        cleanup(
            lambda: remote_python(
                client,
                f"""
            from pathlib import Path
            import shutil
            folder = Path({staging!r}).resolve()
            assert folder.parent == Path('/home/ubuntu') and folder.name == {Path(staging).name!r}
            shutil.rmtree(folder)
        """,
                sudo=True,
            ),
            "Staging cleanup failed",
        )
        cleanup(lambda: archive.unlink(missing_ok=True), "Local release archive cleanup failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qa-dir", type=Path, default=Path(".qa/deployment"))
    parser.add_argument("--scope", default="Verified production release")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True).strip():
        raise RuntimeError("Commit the release changes before deployment.")
    verify_archive_data(project=root)
    subprocess.run(["node", "scripts/build_record.mjs", "check"], cwd=root, check=True)
    record = json.loads((root / ".qa/build.json").read_text(encoding="utf8"))
    for reference, public in DATASETS.values():
        validate_evaluation(root / "dist/data" / public.name, reference / "manifest.json")
    for result in results(root):
        validate_evaluation(
            root / "dist/data" / DATASETS[result["dataset"]][1].name,
            retained_path(result["reference"], root) / "manifest.json",
            result["manifest"]["file"],
            result["evaluation"]["file"],
        )
    output = args.qa_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with closing(paramiko.SSHClient()) as client:
        client.load_host_keys(str(Path.home() / ".ssh/known_hosts"))
        client.connect(
            "124.223.175.32",
            username="ubuntu",
            key_filename=str(Path.home() / ".ssh/xuji_showcase_ed25519"),
            look_for_keys=False,
            allow_agent=False,
            timeout=20,
        )

        def verify_site():
            for script, legacy in [("verify_release.mjs", "1"), ("verify_results.mjs", "0")]:
                subprocess.run(
                    ["node", "scripts/" + script],
                    cwd=root,
                    check=True,
                    env={
                        **os.environ,
                        "SHOWCASE_URL": URL,
                        "SHOWCASE_LEGACY": legacy,
                        "QA_DIR": str(output / "browser" / script.removesuffix(".mjs")),
                    },
                    timeout=600,
                )

        publish(client, root, output, record["commit"], record["files"], args.scope, verify_site)


if __name__ == "__main__":
    main()
