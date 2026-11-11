"""Restore both recovery ZIP formats into a new, fully verified checkout."""

import argparse
import json
import os
import tempfile
import zipfile
from pathlib import Path

from recovery_archive import (
    GitObjects,
    extract_bundle,
    git,
    index_entries,
    read_content,
    read_records,
    safe_path,
    sha256,
    validate_workspace,
)


def restore_refs(package, records, bundle, destination):
    refs = git(destination, "bundle", "list-heads", str(bundle)).decode()
    for line in refs.splitlines():
        oid, ref = line.split(" ", 1)
        if ref.startswith(("refs/heads/", "refs/tags/")) or ref == "refs/stash":
            git(destination, "update-ref", ref, oid)
    git(destination, "remote", "remove", "origin")
    if "repository.json" in records:
        metadata = json.loads(package.read("repository.json"))
        if metadata["branch"]:
            git(destination, "switch", "--force", metadata["branch"])
        else:
            git(destination, "switch", "--detach", "--force", metadata["head"])
        if git(destination, "rev-parse", "HEAD").decode().strip() != metadata["head"]:
            raise ValueError("Restored Git HEAD differs from the backup")
        for ref, expected in metadata.get("refs", {}).items():
            if git(destination, "rev-parse", ref).decode().strip() != expected:
                raise ValueError(f"Restored Git ref differs: {ref}")


def restore_v2(package, destination):
    workspace = json.loads(package.read("workspace.json"))
    validate_workspace(workspace)
    with GitObjects(destination) as objects:
        paths = {}
        for name, expected in workspace["files"].items():
            paths.setdefault(expected, []).append(safe_path(destination, name))
        for expected, files in paths.items():
            raw = read_content(package, objects, workspace["contents"][expected], expected)
            for file in files:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(raw)
        rows = []
        for name, entry in workspace["index"].items():
            content = workspace["contents"][entry["content"]]
            oid = content.get("git")
            if oid is None:
                raw = read_content(package, objects, content, entry["content"])
                oid = git(destination, "hash-object", "-w", "--stdin", input=raw).decode().strip()
            rows.append(f"{entry['mode']} {oid}\t{name}\0".encode("utf8"))
            file = safe_path(destination, name)
            if file.exists() and os.name != "nt":
                file.chmod(0o755 if entry["mode"] == "100755" else 0o644)
    for name in workspace["deleted"]:
        safe_path(destination, name).unlink(missing_ok=True)
    git(destination, "read-tree", "--empty")
    git(destination, "update-index", "-z", "--index-info", input=b"".join(rows))
    for name in workspace["intentToAdd"]:
        git(destination, "update-index", "--force-remove", "--", name)
        file = safe_path(destination, name)
        absent = not file.exists()
        if absent:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.touch()
        git(destination, "add", "-N", "--", name)
        if absent:
            file.unlink()
    for name, expected in workspace["files"].items():
        if sha256(safe_path(destination, name)) != expected:
            raise ValueError(f"Restored workspace mismatch: {name}")
    for name in workspace["deleted"]:
        if safe_path(destination, name).exists():
            raise ValueError(f"Restored workspace deletion mismatch: {name}")
    return set(workspace["intentToAdd"])


def restore_legacy(package, records, destination):
    for name, expected in records.items():
        if not name.startswith("workspace/"):
            continue
        file = safe_path(destination, name.removeprefix("workspace/"))
        if expected is None:
            file.unlink(missing_ok=True)
        else:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(package.read(name))
        actual = sha256(file) if file.exists() else None
        if actual != expected:
            raise ValueError(f"Restored workspace mismatch: {name}")
    return set()


def refresh_clean_files(destination, intent):
    # A raw CRLF snapshot can be unchanged under Git's normalization rules.
    # Refresh these entries only, preserving genuine staged and unstaged edits.
    changed = git(destination, "diff-files", "--name-only", "-z").decode("utf8").split("\0")
    names = [
        name for name in changed if name and name not in intent and (destination / name).is_file()
    ]
    if not names:
        return
    index = index_entries(destination)
    paths = "".join(json.dumps(name, ensure_ascii=False) + "\n" for name in names).encode("utf8")
    hashes = git(destination, "hash-object", "--stdin-paths", input=paths).decode().splitlines()
    clean = [name for name, oid in zip(names, hashes, strict=True) if index[name]["oid"] == oid]
    if clean:
        git(
            destination,
            "add",
            "--pathspec-from-file=-",
            "--pathspec-file-nul",
            input="".join(name + "\0" for name in clean).encode("utf8"),
        )


def restore(archive, destination):
    destination = Path(destination).resolve()
    if destination.exists():
        raise FileExistsError(f"Restore requires a new directory: {destination}")
    with zipfile.ZipFile(archive) as package:
        records = read_records(package)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            prefix=".xuji-restore-", dir=destination.parent
        ) as temporary:
            temporary = Path(temporary)
            bundle, candidate = temporary / "repository.bundle", temporary / "workspace"
            extract_bundle(package, bundle)
            git(temporary, "clone", "--quiet", str(bundle), str(candidate))
            restore_refs(package, records, bundle, candidate)
            intent = (
                restore_v2(package, candidate)
                if "workspace.json" in records
                else restore_legacy(package, records, candidate)
            )
            refresh_clean_files(candidate, intent)
            if destination.exists():
                raise FileExistsError(
                    f"Restore destination was created during recovery: {destination}"
                )
            os.rename(candidate, destination)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("destination", type=Path, help="New checkout directory")
    args = parser.parse_args()
    print(restore(args.archive, args.destination))
