"""Regenerate browser payloads in a temporary directory and compare published bytes."""

import hashlib
import json
import tempfile
from pathlib import Path

from dataset_paths import DATASETS, dataset_info
from export_journey import export


def verify():
    for name, (reference, published) in DATASETS.items():
        source_before = {
            p: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in reference.rglob("*")
            if p.is_file()
        }
        with tempfile.TemporaryDirectory(prefix="xuji-export-") as temporary:
            target = Path(temporary)
            export(reference, target)
            files = [p for p in target.rglob("*") if p.is_file()]
            if {p.relative_to(target) for p in files} != {
                p.relative_to(published) for p in published.rglob("*") if p.is_file()
            }:
                raise ValueError(f"Published resource set differs: {name}")
            for file in files:
                relative = file.relative_to(target)
                if file.suffix == ".json":
                    actual = json.loads(file.read_text(encoding="utf8"))
                    expected = json.loads((published / relative).read_text(encoding="utf8"))
                    if relative.as_posix() == "manifest.json":
                        expected["dataset"] = dataset_info(expected)
                    if actual != expected:
                        raise ValueError(f"Regenerated metadata differs: {name}/{relative}")
                elif file.read_bytes() != (published / relative).read_bytes():
                    raise ValueError(f"Regenerated payload differs: {name}/{relative}")
            assert source_before == {
                p: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in reference.rglob("*")
                if p.is_file()
            }
            print(f"PASS {name}: {len(files)} regenerated files match published payloads")


if __name__ == "__main__":
    verify()
