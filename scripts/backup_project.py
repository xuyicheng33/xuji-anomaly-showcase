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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".qa/backups")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S")
    release = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True
    ).strip()
    bundle = output / f"history-{stamp}-{release}.bundle"
    archive = output / f"xuji-{stamp}-{release}.zip"
    subprocess.run(["git", "bundle", "create", str(bundle), "--all"], cwd=ROOT, check=True)
    subprocess.run(["git", "bundle", "verify", str(bundle)], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8")
    files = {ROOT / name for name in tracked.split("\0") if name}
    for name in RETAINED:
        folder = ROOT / name
        if not folder.exists():
            raise FileNotFoundError(f"Required recovery source is missing: {name}")
        files.update(p for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    records = {}
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for file in sorted(files):
            if not file.resolve().is_relative_to(ROOT) or file.is_symlink():
                raise ValueError(f"Unexpected recovery path: {file}")
            name = file.relative_to(ROOT).as_posix()
            package.write(file, "workspace/" + name)
            records["workspace/" + name] = sha256(file)
        package.write(bundle, "repository.bundle")
        records["repository.bundle"] = sha256(bundle)
        package.writestr("manifest.json", json.dumps(records, indent=2))
    with zipfile.ZipFile(archive) as package:
        for name, expected in records.items():
            with package.open(name) as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise ValueError(f"Recovery archive checksum mismatch: {name}")
    result = {
        "archive": str(archive), "release": release, "files": len(records),
        "bytes": archive.stat().st_size, "sha256": sha256(archive), "verified": True,
        "includes": ["tracked workspace files", "all Git refs", *RETAINED],
    }
    archive.with_suffix(".json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    bundle.unlink()  # The verified ZIP already contains the complete Git bundle.
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

