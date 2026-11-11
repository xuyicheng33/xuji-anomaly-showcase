"""Prepare one verified release without touching the active checkout."""

import gzip
import hashlib
import json
import os
import re
import shutil
import tarfile
import tempfile
import uuid
from pathlib import Path


def hashes(folder):
    folder = Path(folder)
    return {
        p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.suffix != ".gz"
    }


def link_or_copy(source, target):
    """Releases share immutable files; unsupported filesystems fall back to copies."""
    if source.is_symlink():
        raise ValueError(f"Unexpected symbolic link in release: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)


def release_path(folder, name):
    if not name or "\\" in name or ":" in name or name.startswith("/") or ".." in Path(name).parts:
        raise ValueError(f"Unexpected release path: {name}")
    path = folder / name
    if not path.resolve().is_relative_to(folder.resolve()):
        raise ValueError(f"Unexpected release path: {name}")
    return path


def prepare_release(previous, target, archive, expected, changed):
    previous, target = Path(previous).resolve(), Path(target).resolve()
    if target.parent != previous.parent:
        raise ValueError("Release target must be in the current release directory")
    if target.exists():
        return prepare_existing(target, expected)
    # Only expose the final directory after every raw and compressed byte is verified.
    with tempfile.TemporaryDirectory(prefix=f".{target.name}-", dir=target.parent) as temporary:
        candidate = Path(temporary) / "release"
        candidate.mkdir()
        with tarfile.open(archive) as package:
            members = package.getmembers()
            names = [member.name for member in members]
            if (
                len(names) != len(set(names))
                or set(names) != set(changed)
                or not set(names) <= set(expected)
            ):
                raise ValueError("Release archive does not match the changed-file list")
            for member in members:
                if not member.isfile():
                    raise ValueError(f"Unexpected release archive member: {member.name}")
                file = release_path(candidate, member.name)
                file.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source, file.open("xb") as destination:
                    shutil.copyfileobj(source, destination)
        for name, digest in expected.items():
            file = release_path(candidate, name)
            if name not in changed:
                link_or_copy(release_path(previous, name), file)
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError(f"Release checksum differs: {name}")
            # Range offsets always refer to uncompressed retained float32 windows.
            if "windows-v1" in file.relative_to(candidate).parts:
                continue
            if len(raw) < 1024 or file.suffix not in {
                ".bin",
                ".json",
                ".js",
                ".css",
                ".svg",
                ".html",
            }:
                continue
            zipped = file.with_name(file.name + ".gz")
            inherited = release_path(previous, name + ".gz")
            if (
                name not in changed
                and inherited.exists()
                and gzip.decompress(inherited.read_bytes()) == raw
            ):
                link_or_copy(inherited, zipped)
            else:
                packed = gzip.compress(raw, compresslevel=6, mtime=0)
                if len(packed) < len(raw):
                    zipped.write_bytes(packed)
        os.replace(candidate, target)
    return target


def prepare_existing(target, expected):
    if hashes(target) != expected:
        raise ValueError("Existing release differs from the verified build")
    for zipped in target.rglob("*.gz"):
        if gzip.decompress(zipped.read_bytes()) != zipped.with_suffix("").read_bytes():
            raise ValueError(f"Compressed release differs: {zipped}")
    return target


def prepare_staged(previous, target, staging, changed):
    staging = Path(staging)
    expected = json.loads((staging / "files.json").read_text())
    prepare_release(previous, target, staging / "changes.tar.gz", expected, changed)


def atomic_write(file, content):
    file = Path(file)
    temporary = file.with_name("." + file.name + "-" + uuid.uuid4().hex)
    try:
        with temporary.open("xb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, file.stat().st_mode & 0o777 if file.exists() else 0o644)
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def install_config(config, backup, replacement, expected_digest):
    config, backup = Path(config), Path(backup)
    content = config.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_digest:
        raise ValueError("Site configuration changed during release preparation")
    backup.parent.mkdir(parents=True, exist_ok=True)
    with backup.open("xb") as file:
        file.write(content)
    atomic_write(config, Path(replacement).read_bytes())


def restore_config(config, backup):
    backup = Path(backup)
    if backup.exists():
        atomic_write(config, backup.read_bytes())


def switch_release(current, target, expected=None):
    current = Path(current)
    if expected is not None and current.resolve() != Path(expected).resolve():
        raise ValueError("Active release changed before switching")
    temporary = current.with_name("." + current.name + "-" + uuid.uuid4().hex)
    try:
        temporary.symlink_to(target, target_is_directory=True)
        os.replace(temporary, current)
    finally:
        temporary.unlink(missing_ok=True)


def rollback_config(site, current, target, previous, backup):
    """Repeating a release must retain the original predecessor's configuration."""
    site = Path(site)
    if current != target or previous == target:
        return backup
    record = json.loads((site / "deployment.json").read_text())
    saved = Path(record["rollbackConfig"])
    if (
        record["releasePath"] != target
        or record["previousRelease"] != Path(previous).name
        or saved.parent != site / "config-backups"
        or not saved.is_file()
    ):
        raise ValueError("Previous release rollback configuration is unavailable")
    return str(saved)


def record_deployment(site, result):
    atomic_write(Path(site) / "deployment.json", json.dumps(result, indent=2).encode())


def prune_releases(site, current, previous, backup):
    """After acceptance, retain the active release, its predecessor and rollback config."""
    site = Path(site).resolve()
    releases = site / "releases"
    kept = {Path(current).resolve(), Path(previous).resolve()}
    if any(path.parent != releases or not path.is_dir() for path in kept):
        raise ValueError("Unexpected retained release path")
    if (site / "current").resolve() != Path(current).resolve():
        raise ValueError("Active release changed before retention cleanup")
    backup = Path(backup).resolve()
    if backup.parent != site / "config-backups" or not backup.is_file():
        raise ValueError("Missing verified rollback configuration")
    removed = []
    for folder in releases.iterdir():
        if (
            folder.is_symlink()
            or not folder.is_dir()
            or not re.fullmatch(r"[a-f0-9]{7,40}", folder.name)
        ):
            continue
        if folder.resolve() not in kept:
            shutil.rmtree(folder)
            removed.append(folder.name)
    for config in backup.parent.glob("*.conf"):
        if (
            config != backup
            and not config.is_symlink()
            and re.fullmatch(r"[a-f0-9]{7}-[0-9]{20}\.conf", config.name)
        ):
            config.unlink()
    result = {
        "retainedReleases": sorted(path.name for path in kept),
        "removedReleases": sorted(removed),
    }
    print(json.dumps(result))
    return result
