"""Keep complete experiment bytes outside Git and verify them before research or release."""

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path

from dataset_paths import PROJECT, RETAINED, archive_root, retained_path

INDEX = "data/experiment-archive.json"


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(root=None, project=PROJECT):
    project = Path(project).resolve()
    root = Path(root).resolve() if root is not None else archive_root(project)
    inventory = json.loads((project / INDEX).read_text(encoding="utf8"))
    if inventory.get("schemaVersion") != 1:
        raise ValueError("Unsupported experiment archive inventory")
    expected = inventory["files"]
    for name, record in expected.items():
        if not any(name.startswith(folder + "/") for folder in RETAINED):
            raise ValueError(f"Unexpected experiment archive path: {name}")
        # Validate the logical name with the same rules used by all exporters.
        retained_path(name, project)
        path = root / name
        if not path.resolve().is_relative_to(root) or path.is_symlink():
            raise ValueError(f"Unsafe experiment archive path: {name}")
        if not path.is_file():
            raise FileNotFoundError(
                "完整实验数据未就绪。只改页面可运行 npm run verify:frontend；"
                "完整复核请先运行 npm run data:use -- 数据包目录。"
                f" 缺少：{name}"
            )
        if path.stat().st_size != record["bytes"] or checksum(path) != record["sha256"]:
            raise ValueError(f"Experiment archive file differs: {name}")
    actual = {
        path.relative_to(root).as_posix()
        for folder in RETAINED
        for path in (root / folder).rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }
    if actual != set(expected):
        raise ValueError(f"Experiment archive inventory differs: {sorted(actual ^ set(expected))}")
    total = sum(record["bytes"] for record in expected.values())
    if total != inventory["bytes"]:
        raise ValueError("Experiment archive byte count differs")
    print(f"PASS complete experiment archive: {len(expected)} files, {total / 1024**2:.1f} MiB")
    return inventory


def configure(root, project=PROJECT):
    root, project = Path(root).resolve(), Path(project).resolve()
    verify(root, project)
    settings = project / ".qa/data-location.json"
    settings.parent.mkdir(parents=True, exist_ok=True)
    settings.write_text(json.dumps({"root": str(root)}, ensure_ascii=False) + "\n", encoding="utf8")
    print(f"Complete experiment data: {root}")


def save(destination, project=PROJECT):
    project, destination = Path(project).resolve(), Path(destination).resolve()
    if (
        destination.exists()
        or destination.is_relative_to(project)
        or project.is_relative_to(destination)
    ):
        raise ValueError("Choose a new experiment archive directory outside the project")
    source_root = archive_root(project)
    files = {}
    for folder in RETAINED:
        source = source_root / folder
        if not source.is_dir():
            raise FileNotFoundError(f"Missing experiment source: {source}")
        for path in sorted(source.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                files[path.relative_to(source_root).as_posix()] = {
                    "bytes": path.stat().st_size,
                    "sha256": checksum(path),
                }
    inventory = {
        "schemaVersion": 1,
        "bytes": sum(row["bytes"] for row in files.values()),
        "files": files,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".xuji-experiments-", dir=destination.parent
    ) as temporary:
        candidate = Path(temporary) / "archive"
        candidate.mkdir()
        for name, record in files.items():
            target = candidate / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_root / name, target)
            if target.stat().st_size != record["bytes"] or checksum(target) != record["sha256"]:
                raise ValueError(f"Copied experiment file differs: {name}")
        for path in (project / "data").glob("*.json"):
            if path.name != "experiment-archive.json":
                shutil.copyfile(path, candidate / "data" / path.name)
        payload = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
        (candidate / "archive-index.json").write_text(payload, encoding="utf8")
        # Recheck the source before accepting the external copy.
        for name, record in files.items():
            if checksum(source_root / name) != record["sha256"]:
                raise ValueError(f"Experiment source changed during archiving: {name}")
        os.rename(candidate, destination)
    (project / INDEX).write_text(payload, encoding="utf8")
    configure(destination, project)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("verify")
    commands.add_parser("use").add_argument("directory", type=Path)
    commands.add_parser("save").add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.command == "verify":
        verify()
    elif args.command == "use":
        configure(args.directory)
    else:
        save(args.directory)


if __name__ == "__main__":
    main()
