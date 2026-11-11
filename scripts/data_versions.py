"""Bind every explicit asset path to immutable content without duplicating payloads."""

import hashlib
import json
from pathlib import Path


def version_assets(public):
    public = Path(public)
    manifest_path = public / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    mapped = {}

    def visit(value):
        if isinstance(value, list):
            return [visit(item) for item in value]
        if not isinstance(value, dict):
            return value
        updated = {key: visit(item) for key, item in value.items()}
        if not {"file", "sha256", "bytes"} <= value.keys():
            return updated
        old = value["file"]
        if old in mapped:
            updated.update(mapped[old])
            return updated
        source = public / old
        # Full matrix descriptors identify curve/row families; the matrices themselves
        # are deliberately not part of the published payloads.
        if not source.is_file():
            return updated
        if old not in mapped:
            raw = source.read_bytes()
            if len(raw) != value["bytes"] or hashlib.sha256(raw).hexdigest() != value["sha256"]:
                raise ValueError(f"Asset changed before versioning: {old}")
            if source.suffix == ".json":
                raw = (
                    json.dumps(visit(json.loads(raw)), ensure_ascii=False, separators=(",", ":"))
                    + "\n"
                ).encode("utf8")
            checksum = hashlib.sha256(raw).hexdigest()
            parts = Path(old).parts
            parent = Path(parts[0]) if len(parts) > 1 else Path("metadata-v1")
            versioned = parent / checksum / Path(*parts[1:] if len(parts) > 1 else parts)
            target = public / versioned
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.suffix == ".json":
                target.write_bytes(raw)
                source.unlink()
            else:
                source.rename(target)
            mapped[old] = {"file": versioned.as_posix(), "sha256": checksum, "bytes": len(raw)}
        updated.update(mapped[old])
        return updated

    manifest = visit(manifest)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8"
    )
    for directory in sorted(
        (p for p in public.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True
    ):
        if not any(directory.iterdir()):
            directory.rmdir()
    return manifest
