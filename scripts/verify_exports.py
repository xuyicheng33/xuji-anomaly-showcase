"""Regenerate browser payloads in a temporary directory and compare published bytes."""

import hashlib
import json
import tempfile
from pathlib import Path

from dataset_paths import DATASETS, dataset_info, retained_path
from export_journey import export
from result_catalog import registered_files, results


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
            if {p.relative_to(target) for p in files} | {
                Path(name) for name in registered_files(published)
            } != {p.relative_to(published) for p in published.rglob("*") if p.is_file()}:
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
    for result in results():
        reference = retained_path(result["reference"])
        published = DATASETS[result["dataset"]][1]
        with tempfile.TemporaryDirectory(prefix="xuji-result-export-") as temporary:
            target = Path(temporary)
            export(reference, target)
            checked = set()
            for file in target.rglob("*"):
                if not file.is_file():
                    continue
                relative = file.relative_to(target).as_posix()
                if relative in ("manifest.json", "evaluation.json"):
                    relative = result["manifest" if relative == "manifest.json" else "evaluation"][
                        "file"
                    ]
                if file.read_bytes() != (published / relative).read_bytes():
                    raise ValueError(f"Regenerated result differs: {result['id']}/{relative}")
                checked.add(relative)
            assert checked == set(result["published"])
            print(f"PASS {result['id']}: {len(checked)} regenerated files match published payloads")


if __name__ == "__main__":
    verify()
