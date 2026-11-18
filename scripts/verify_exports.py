"""Regenerate browser payloads in a temporary directory and compare published bytes."""

import tempfile
from pathlib import Path

from dataset_paths import DATASETS
from export_journey import export


def verify():
    for name, (reference, published) in DATASETS.items():
        with tempfile.TemporaryDirectory(prefix="xuji-export-") as temporary:
            target = Path(temporary) / published.name
            target.mkdir()
            export(reference, target, name)
            files = {p.relative_to(target) for p in target.rglob("*") if p.is_file()}
            if files != {p.relative_to(published) for p in published.rglob("*") if p.is_file()}:
                raise ValueError(f"Published resource set differs: {name}")
            for relative in sorted(files):
                if (target / relative).read_bytes() != (published / relative).read_bytes():
                    raise ValueError(f"Regenerated payload differs: {name}/{relative}")
            print(
                f"PASS {name}: all {len(files)} legacy and registered files match published bytes"
            )


if __name__ == "__main__":
    verify()
