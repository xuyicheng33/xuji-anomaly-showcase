"""Verify every shipped resource without requiring experiment archives."""

import hashlib
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def verify(project=PROJECT):
    project = Path(project)
    index = json.loads((project / "data/frontend-assets.json").read_text(encoding="utf8"))
    if index.get("schemaVersion") != 1:
        raise ValueError("Unsupported frontend resource inventory")
    expected = index["files"]
    actual = {
        p.relative_to(project).as_posix() for p in (project / "public").rglob("*") if p.is_file()
    }
    if actual != set(expected):
        raise ValueError(f"Frontend resource inventory differs: {sorted(actual ^ set(expected))}")
    for name, record in expected.items():
        path = project / name
        if not path.resolve().is_relative_to((project / "public").resolve()) or path.is_symlink():
            raise ValueError(f"Unsafe frontend resource: {name}")
        with path.open("rb") as stream:
            checksum = hashlib.file_digest(stream, "sha256").hexdigest()
        if path.stat().st_size != record["bytes"] or checksum != record["sha256"]:
            raise ValueError(f"Frontend resource differs: {name}")
    print(f"PASS frontend resources: {len(expected)} files, all sizes and SHA-256 checksums")


if __name__ == "__main__":
    verify()
