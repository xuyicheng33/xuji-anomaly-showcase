"""Restore a recovery ZIP into a new checkout, including workspace deletions."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile
import zipfile


def restore(archive, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(archive) as package:
        records = json.loads(package.read("manifest.json"))
        for name, expected in records.items():
            if expected is not None:
                with package.open(name) as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                        raise ValueError(f"Recovery archive checksum mismatch: {name}")
        with tempfile.TemporaryDirectory() as temporary:
            bundle = Path(temporary) / "repository.bundle"
            bundle.write_bytes(package.read("repository.bundle"))
            subprocess.run(["git", "clone", str(bundle), str(destination)], check=True)
        for name, expected in records.items():
            if not name.startswith("workspace/"):
                continue
            file = destination / name.removeprefix("workspace/")
            if not file.resolve().is_relative_to(destination):
                raise ValueError(f"Unexpected recovery path: {name}")
            if expected is None:
                file.unlink(missing_ok=True)
            else:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(package.read(name))
        for name, expected in records.items():
            if name.startswith("workspace/"):
                file = destination / name.removeprefix("workspace/")
                actual = hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
                if actual != expected:
                    raise ValueError(f"Restored workspace mismatch: {name}")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("destination", type=Path, help="New checkout directory")
    args = parser.parse_args()
    print(restore(args.archive, args.destination))
