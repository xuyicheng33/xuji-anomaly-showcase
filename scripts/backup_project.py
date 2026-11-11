"""Create a self-contained recovery ZIP without duplicating files already in Git."""

import argparse
import json
import os
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from recovery_archive import (
    GitObjects,
    digest,
    git,
    index_entries,
    json_bytes,
    recovery_identity,
    repository_state,
    safe_path,
    sha256,
    tree_entries,
    verify_archive,
)

ROOT = Path(__file__).resolve().parents[1]
RETAINED = ("data/source", "data/models", "data/reference", "materials")


def workspace_files(root, output):
    names = set(
        filter(
            None,
            git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
            .decode("utf8")
            .split("\0"),
        )
    )
    for name in RETAINED:
        folder = root / name
        if not folder.is_dir():
            raise FileNotFoundError(f"Required recovery source is missing: {name}")
        if output == folder or folder in output.parents or output in folder.parents:
            raise ValueError("Backup output overlaps retained source materials")
        names.update(
            p.relative_to(root).as_posix()
            for p in folder.rglob("*")
            if p.is_file() and "__pycache__" not in p.parts
        )
    return {
        name: safe_path(root, name)
        for name in names
        if not (root / name).resolve().is_relative_to(output) and (root / name).is_file()
    }


def create_backup(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    if root == output or output in root.parents:
        raise ValueError("Choose a backup directory separate from the project root")
    head, index = tree_entries(root), index_entries(root)
    if any((root / name).resolve().is_relative_to(output) for name in head.keys() | index.keys()):
        raise ValueError("Backup output overlaps tracked project files")
    files = workspace_files(root, output)
    repository = repository_state(root)
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S%f")
    release = repository["head"][:7]
    archive = output / f"xuji-{stamp}-{release}.zip"
    with tempfile.TemporaryDirectory(prefix=".xuji-backup-", dir=output) as temporary:
        temporary = Path(temporary)
        bundle, candidate = temporary / "repository.bundle", temporary / "backup.zip"
        git(root, "bundle", "create", str(bundle), "--all", "HEAD")
        git(root, "bundle", "verify", str(bundle))
        available, contents, records = {}, {}, {}
        with (
            GitObjects(root) as objects,
            zipfile.ZipFile(
                candidate, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6
            ) as package,
        ):
            for oid in sorted({entry["oid"] for entry in head.values()}):
                raw = objects.read(oid)
                available[digest(raw)] = {"git": oid, "bytes": len(raw)}

            def store(raw):
                checksum = digest(raw)
                if checksum not in contents:
                    if checksum in available:
                        contents[checksum] = available[checksum]
                    else:
                        member = "objects/" + checksum
                        package.writestr(member, raw)
                        records[member] = checksum
                        contents[checksum] = {"member": member, "bytes": len(raw)}
                return checksum

            saved_files = {name: store(file.read_bytes()) for name, file in sorted(files.items())}
            saved_index = {
                name: {"mode": entry["mode"], "content": store(objects.read(entry["oid"]))}
                for name, entry in sorted(index.items())
            }
            staged_adds = set(
                git(root, "diff", "--cached", "--name-only", "--diff-filter=A", "-z")
                .decode("utf8")
                .split("\0")
            )
            workspace = {
                "version": 2,
                "files": saved_files,
                "deleted": sorted(
                    name for name in head.keys() | index.keys() if not (root / name).exists()
                ),
                "index": saved_index,
                "intentToAdd": sorted(index.keys() - head.keys() - staged_adds),
                "contents": contents,
            }
            package.write(bundle, "repository.bundle", compress_type=zipfile.ZIP_STORED)
            records["repository.bundle"] = sha256(bundle)
            for name, value in [("repository.json", repository), ("workspace.json", workspace)]:
                raw = json_bytes(value)
                package.writestr(name, raw)
                records[name] = digest(raw)
            package.writestr("manifest.json", json_bytes(records))
        if (
            repository_state(root) != repository
            or index_entries(root) != index
            or workspace_files(root, output).keys() != files.keys()
        ):
            raise RuntimeError("Repository changed during backup; retry after the edits finish")
        if any(sha256(file) != saved_files[name] for name, file in files.items()):
            raise RuntimeError("Workspace changed during backup; retry after the edits finish")
        verify_archive(candidate)
        with zipfile.ZipFile(candidate) as package:
            state = recovery_identity(package)
        result = {
            "formatVersion": 2,
            "archive": str(archive),
            "release": release,
            "stateId": state,
            "files": len(files),
            "bytes": candidate.stat().st_size,
            "sha256": sha256(candidate),
            "verified": True,
            "workspaceBytes": sum(contents[key]["bytes"] for key in saved_files.values()),
            "storedExtraBytes": sum(row["bytes"] for row in contents.values() if "member" in row),
            "includes": [
                "Git history, branches, tags and HEAD",
                "exact workspace bytes and deletions",
                "portable staging state",
                *RETAINED,
            ],
        }
        metadata = temporary / "backup.json"
        metadata.write_bytes(json_bytes(result))
        os.replace(candidate, archive)
        os.replace(metadata, archive.with_suffix(".json"))
    return result


def backup_inventory(output, keep):
    retained, records = set(), []
    for archive in sorted(Path(output).glob("xuji-*.zip"), reverse=True):
        metadata = archive.with_suffix(".json")
        try:
            result = json.loads(metadata.read_text(encoding="utf8")) if metadata.exists() else {}
        except (ValueError, OSError):
            result = {}
        verified = bool(result.get("verified") and result.get("sha256") and result.get("bytes"))
        identity = result.get("stateId")
        remove = False
        if verified and result["bytes"] == archive.stat().st_size:
            try:
                if not identity:
                    with zipfile.ZipFile(archive) as package:
                        identity = recovery_identity(package)
                remove = identity in retained or len(retained) >= keep
                if not remove:
                    retained.add(identity)
            except (ValueError, KeyError, zipfile.BadZipFile):
                verified = False
        records.append(
            {
                "archive": str(archive),
                "bytes": archive.stat().st_size,
                "release": result.get("release"),
                "stateId": identity,
                "verified": verified,
                "action": "candidate" if remove else "keep",
            }
        )
    return records


def prune_backups(output, keep, apply=False):
    if keep < 1:
        raise ValueError("Keep at least one recovery state")
    records = backup_inventory(output, keep)
    if apply:
        for row in records:
            if not row["verified"]:
                continue
            archive = Path(row["archive"])
            expected = json.loads(archive.with_suffix(".json").read_text(encoding="utf8"))["sha256"]
            if sha256(archive) != expected:
                raise ValueError(f"Recovery archive checksum mismatch: {archive}")
            verify_archive(archive)
            with zipfile.ZipFile(archive) as package:
                if recovery_identity(package) != row["stateId"]:
                    raise ValueError(f"Recovery state differs from retention metadata: {archive}")
        for row in records:
            if row["action"] == "candidate":
                archive = Path(row["archive"])
                archive.unlink()
                archive.with_suffix(".json").unlink()
    return {
        "applied": apply,
        "keepDistinctStates": keep,
        "archives": records,
        "candidateBytes": sum(row["bytes"] for row in records if row["action"] == "candidate"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".qa/backups")
    parser.add_argument("--prune", action="store_true", help="Preview old backup candidates")
    parser.add_argument(
        "--keep", type=int, default=3, help="Distinct recovery states to retain (default: 3)"
    )
    parser.add_argument("--apply", action="store_true", help="Apply the verified pruning plan")
    args = parser.parse_args()
    if args.keep < 1 or (args.apply and not args.prune):
        parser.error("--keep must be positive; --apply requires --prune")
    result = (
        prune_backups(args.output.resolve(), args.keep, args.apply)
        if args.prune
        else create_backup(ROOT, args.output)
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
