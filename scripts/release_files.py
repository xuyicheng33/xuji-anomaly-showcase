"""Prepare one verified release without touching the active checkout."""
import gzip
import hashlib
import json
import os
import shutil
import tarfile
from pathlib import Path


def hashes(folder):
    folder = Path(folder)
    return {p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(folder.rglob('*')) if p.is_file() and p.suffix != '.gz'}


def prepare_release(previous, target, archive, expected, changed):
    previous, target = Path(previous).resolve(), Path(target).resolve()
    if target.parent != previous.parent:
        raise ValueError('Release target must be in the current release directory')
    if target.exists():
        return prepare_existing(target, expected)
    try:
        shutil.copytree(previous, target)
        with tarfile.open(archive) as package:
            package.extractall(target, filter='data')
        for file in list(target.rglob('*')):
            if file.is_file() and file.suffix != '.gz' and file.relative_to(target).as_posix() not in expected:
                file.unlink()
        for name, digest in expected.items():
            file = target / name
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError(f'Release checksum differs: {name}')
            zipped = file.with_name(file.name + '.gz')
            if zipped.exists() and gzip.decompress(zipped.read_bytes()) != raw:
                zipped.unlink()
            if name in changed and len(raw) >= 1024 and file.suffix in {'.bin', '.json', '.js', '.css', '.svg', '.html'}:
                packed = gzip.compress(raw, compresslevel=6, mtime=0)
                if len(packed) < len(raw):
                    zipped.write_bytes(packed)
        for zipped in list(target.rglob('*.gz')):
            raw = zipped.with_suffix('')
            if not raw.exists():
                zipped.unlink()
            elif gzip.decompress(zipped.read_bytes()) != raw.read_bytes():
                raise ValueError(f'Compressed release differs: {zipped}')
    except Exception:
        shutil.rmtree(target)
        raise
    return target


def prepare_existing(target, expected):
    if hashes(target) != expected:
        raise ValueError('Existing release differs from the verified build')
    for zipped in target.rglob('*.gz'):
        if gzip.decompress(zipped.read_bytes()) != zipped.with_suffix('').read_bytes():
            raise ValueError(f'Compressed release differs: {zipped}')
    return target


def prepare_staged(previous, target, staging, changed):
    staging = Path(staging)
    expected = json.loads((staging / 'files.json').read_text())
    prepare_release(previous, target, staging / 'changes.tar.gz', expected, changed)


def install_config(config, backup, replacement, expected_digest):
    config, backup = Path(config), Path(backup)
    content = config.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_digest:
        raise ValueError('Site configuration changed during release preparation')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with backup.open('xb') as file:
        file.write(content)
    config.write_bytes(Path(replacement).read_bytes())


def restore_config(config, backup):
    backup = Path(backup)
    if backup.exists():
        Path(config).write_bytes(backup.read_bytes())


def switch_release(current, target):
    current = Path(current)
    temporary = current.with_name(current.name + '-next')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target, target_is_directory=True)
    os.replace(temporary, current)
