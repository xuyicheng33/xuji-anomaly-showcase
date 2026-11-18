"""Import already verified inference packages without running models or choosing scores."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from array_assets import write_array
from dataset_paths import DATASETS, PROJECT, archive_root, retained_path
from export_journey import export_result
from result_catalog import result_method, results, write_catalog


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def copy_exact(source, target):
    if target.exists():
        if digest(source) != digest(target):
            raise ValueError(f"Existing retained file differs: {target}")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def install(source):
    source = Path(source).resolve()
    snapshot = json.loads((source / "snapshot.json").read_text(encoding="utf8"))
    records = json.loads((PROJECT / "data/manifest.json").read_text(encoding="utf-8-sig"))
    indexed = {record["local"]: record for record in records}
    registrations = []
    prior = results()
    catalogs = {name: [] for name in DATASETS}
    for spec in snapshot["candidates"]:
        ident = spec["id"]
        family = "converter" if spec["family"] == "converter" else "wind"
        run = source / "runs" / ident
        reference = retained_path("data/reference/results-v1/" + ident)
        if reference.exists() and digest(reference / "manifest.json") != digest(
            run / "reference/manifest.json"
        ):
            raise ValueError(f"Existing result differs: {ident}")
        for original in (run / "reference").rglob("*"):
            if original.is_file():
                copy_exact(original, reference / original.relative_to(run / "reference"))
        original_sources = []
        for record in spec["sourceProvenance"]:
            original = source / record["snapshot"]
            if original.stat().st_size != record["bytes"] or digest(original) != record["sha256"]:
                raise ValueError(f"Supplement source differs: {original}")
            relative = original.relative_to(source / spec["inputDirectory"])
            target = (
                retained_path(f"data/models/results-v1/{ident}.ckpt")
                if relative.as_posix() == "viz/best_model.ckpt"
                else retained_path("data/source/results-v1/" + ident) / relative
            )
            copy_exact(original, target)
            local = target.relative_to(archive_root()).as_posix()
            indexed[local] = {
                "local": local,
                "remote": record["original"],
                "bytes": record["bytes"],
                "sha256": record["sha256"],
            }
            original_sources.append({**record, "local": local})
        native_index = {}
        for original in (run / "native").rglob("*.npy"):
            relative = original.relative_to(run / "native").as_posix()
            values = np.load(original, mmap_mode="r")
            if relative in ("predictions.npy", "errors.npy"):
                chunks = [
                    dict(
                        start=start,
                        count=len(values[start : start + 32]),
                        **write_array(
                            reference / "native",
                            f"{original.stem}/{start}.bin",
                            values[start : start + 32],
                            values.dtype,
                        ),
                    )
                    for start in range(0, len(values), 32)
                ]
                with original.open("rb") as handle:
                    header = handle.read(values.offset).hex()
                native_index[relative] = {
                    "sha256": digest(original),
                    "header": header,
                    "dtype": values.dtype.str,
                    "shape": list(values.shape),
                    "chunks": chunks,
                }
            else:
                target = reference / "native" / relative
                copy_exact(original, target)
                native_index[relative] = {
                    "sha256": digest(original),
                    "file": target.relative_to(reference).as_posix(),
                }
        save_json(reference / "native/index.json", native_index)
        for name in ("inference.json", "comparison.json"):
            copy_exact(run / name, reference / name)
        descriptors, published = export_result(reference, DATASETS[family][1])
        registration = {
            "id": ident,
            "dataset": family,
            "method": spec["method"],
            "reference": reference.relative_to(archive_root()).as_posix(),
            "manifest": descriptors["manifest.json"],
            "evaluation": descriptors["evaluation.json"],
            "published": published,
            "sources": original_sources,
            "config": spec["config"],
        }
        catalogs[family].append(result_method(reference, registration))
        registrations.append(registration)
    save_json(PROJECT / "data/manifest.json", list(indexed.values()))
    save_json(
        PROJECT / "data/results-index.json",
        {"schemaVersion": 1, "supplementVersion": snapshot["version"], "results": registrations},
    )
    for family, methods in catalogs.items():
        write_catalog(DATASETS[family][1], family, methods)
    for old in prior:
        public = DATASETS[old["dataset"]][1].resolve()
        used = {
            name
            for item in registrations
            if item["dataset"] == old["dataset"]
            for name in item["published"]
        }
        for name, checksum in old["published"].items():
            if name.startswith("results-v1/") and name not in used:
                path = (public / name).resolve()
                if not path.is_relative_to(public) or digest(path) != checksum:
                    raise ValueError("Unexpected previous result metadata")
                path.unlink()
    retained = json.loads((PROJECT / "data/reference-index.json").read_text(encoding="utf8"))
    retained.update(
        {
            path.relative_to(archive_root()).as_posix(): digest(path)
            for path in retained_path("data/reference/results-v1").rglob("*")
            if path.is_file()
        }
    )
    save_json(PROJECT / "data/reference-index.json", retained)
    print(f"Imported {len(registrations)} frozen results; legacy resources preserved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    install(parser.parse_args().source)
