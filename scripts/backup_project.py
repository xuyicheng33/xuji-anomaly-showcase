"""Create and verify a local recovery archive, including Git history and retained research data."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RETAINED = ("data/source", "data/models", "data/reference", "materials")


def sha256(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_archive(archive):
    with zipfile.ZipFile(archive) as package:
        records = json.loads(package.read('manifest.json'))
        for name, expected in records.items():
            if expected is None:
                continue
            with package.open(name) as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            if actual != expected:
                raise ValueError(f'Recovery archive checksum mismatch: {name}')


def backup_inventory(output, keep):
    """Retain the latest backup for each of the newest distinct releases."""
    retained, records = set(), []
    for archive in sorted(output.glob('xuji-*.zip'), reverse=True):
        metadata = archive.with_suffix('.json')
        result = json.loads(metadata.read_text(encoding='utf8')) if metadata.exists() else None
        verified = result and result.get('verified')
        remove = False
        if verified and result['bytes'] == archive.stat().st_size:
            release = result['release']
            remove = release in retained or len(retained) >= keep
            if not remove:
                retained.add(release)
        records.append({'archive': str(archive), 'bytes': archive.stat().st_size,
                        'release': result['release'] if result else None,
                        'verified': bool(verified),
                        'action': 'candidate' if remove else 'keep'})
    return records


def prune_backups(output, keep, apply=False):
    records = backup_inventory(output, keep)
    if apply:
        # Verify candidates and recovery copies before deleting any archive.
        for row in records:
            archive = Path(row['archive'])
            metadata = archive.with_suffix('.json')
            if not row['verified']:
                continue
            expected = json.loads(metadata.read_text(encoding='utf8'))['sha256']
            if sha256(archive) != expected:
                raise ValueError(f'Recovery archive checksum mismatch: {archive}')
            verify_archive(archive)
        for row in records:
            if row['action'] == 'candidate':
                archive = Path(row['archive'])
                archive.unlink()
                archive.with_suffix('.json').unlink()
    return {'applied': apply, 'keepDistinctReleases': keep, 'archives': records,
            'candidateBytes': sum(row['bytes'] for row in records if row['action'] == 'candidate')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".qa/backups")
    parser.add_argument('--prune', action='store_true', help='Preview old backup candidates')
    parser.add_argument('--keep', type=int, default=3, help='Distinct releases to retain (default: 3)')
    parser.add_argument('--apply', action='store_true', help='Apply the verified pruning plan')
    args = parser.parse_args()
    if args.keep < 1 or (args.apply and not args.prune):
        parser.error('--keep must be positive; --apply requires --prune')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.prune:
        print(json.dumps(prune_backups(output, args.keep, args.apply), ensure_ascii=False))
        return
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S")
    release = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True
    ).strip()
    bundle = output / f"history-{stamp}-{release}.bundle"
    archive = output / f"xuji-{stamp}-{release}.zip"
    subprocess.run(["git", "bundle", "create", str(bundle), "--all"], cwd=ROOT, check=True)
    subprocess.run(["git", "bundle", "verify", str(bundle)], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    workspace = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    ).decode("utf-8")
    files = {ROOT / name for name in workspace.split("\0") if name and (ROOT / name).is_file()}
    deleted = subprocess.check_output(
        ["git", "diff", "HEAD", "--no-renames", "--diff-filter=D", "--name-only", "-z"], cwd=ROOT
    ).decode("utf-8")
    for name in RETAINED:
        folder = ROOT / name
        if not folder.exists():
            raise FileNotFoundError(f"Required recovery source is missing: {name}")
        files.update(p for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    records = {"workspace/" + name: None for name in deleted.split("\0")
               if name and not (ROOT / name).exists()}
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for file in sorted(files):
            if not file.resolve().is_relative_to(ROOT) or file.is_symlink():
                raise ValueError(f"Unexpected recovery path: {file}")
            name = file.relative_to(ROOT).as_posix()
            package.write(file, "workspace/" + name)
            records["workspace/" + name] = sha256(file)
        package.write(bundle, "repository.bundle")
        records["repository.bundle"] = sha256(bundle)
        branch = subprocess.run(["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
                                cwd=ROOT, capture_output=True, text=True).stdout.strip()
        repository = json.dumps({
            "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "branch": branch or None,
        }).encode("utf-8")
        package.writestr("repository.json", repository)
        records["repository.json"] = hashlib.sha256(repository).hexdigest()
        package.writestr("manifest.json", json.dumps(records, indent=2))
    verify_archive(archive)
    result = {
        "archive": str(archive), "release": release, "files": len(records),
        "bytes": archive.stat().st_size, "sha256": sha256(archive), "verified": True,
        "includes": ["tracked and non-ignored untracked workspace files", "workspace deletions", "all Git refs", *RETAINED],
    }
    archive.with_suffix(".json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    bundle.unlink()  # The verified ZIP already contains the complete Git bundle.
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

