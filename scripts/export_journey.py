"""Publish the frozen reference data without inference or threshold selection."""

import hashlib
import json
import os
import shutil
import tempfile
import time
from pathlib import Path

from data_versions import version_assets
from dataset_paths import DATASETS, retained_path, selected_dataset
from evaluation_policy import POLICY, policy_for_window
from export_runtime import export as export_runtime
from release_validation import validate_evaluation
from result_catalog import result_method, results, write_catalog


def build_export(reference, public):
    reference, public = Path(reference), Path(public)
    source = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
    if any(
        source["evaluation"].get(key) != value
        for key, value in policy_for_window(source.get("window", 64)).items()
    ):
        raise ValueError("Retained evaluation policy differs")
    public.mkdir(parents=True, exist_ok=True)
    for model in source["models"]:
        for chunk in model["windows"]["chunks"]:
            original = reference / chunk["file"]
            payload = original.read_bytes()
            if (
                len(payload) != chunk["bytes"]
                or hashlib.sha256(payload).hexdigest() != chunk["sha256"]
            ):
                raise ValueError(f"Retained window differs: {chunk['file']}")
            target = public / chunk["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
    evaluation = {
        "version": source["resultVersion"],
        "policy": {key: source["evaluation"][key] for key in POLICY},
        "models": [
            {"id": model["id"], **{key: model["evaluation"][key] for key in ("sequence", "window")}}
            for model in source["models"]
        ],
    }
    (public / "evaluation.json").write_text(
        json.dumps(evaluation, ensure_ascii=False, indent=2), encoding="utf8", newline="\r\n"
    )
    export_runtime(reference, public)
    version_assets(public)
    validate_evaluation(public, reference / "manifest.json")


def export_result(reference, public):
    """Add one result's content-addressed files to the dataset tree."""
    descriptors, published = {}, {}
    with tempfile.TemporaryDirectory(prefix=".result-", dir=public.parent) as temporary:
        generated = Path(temporary)
        build_export(reference, generated)
        for original in generated.rglob("*"):
            if not original.is_file():
                continue
            with original.open("rb") as stream:
                checksum = hashlib.file_digest(stream, "sha256").hexdigest()
            relative = original.relative_to(generated).as_posix()
            if relative in ("manifest.json", "evaluation.json"):
                relative = f"results-v1/{checksum}/{relative}"
                descriptors[original.name] = {
                    "file": relative,
                    "bytes": original.stat().st_size,
                    "sha256": checksum,
                }
            target = public / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            original.replace(target)
            published[relative] = checksum
    return descriptors, published


def build_dataset(reference, public, dataset):
    build_export(reference, public)
    methods = []
    for result in results():
        if result["dataset"] != dataset:
            continue
        retained = retained_path(result["reference"])
        _, published = export_result(retained, public)
        if published != result["published"]:
            raise ValueError(f"Regenerated result differs: {result['id']}")
        methods.append(result_method(retained, result))
    write_catalog(public, dataset, methods)


def replace_directory(source, target):
    for attempt in range(6):
        try:
            os.replace(source, target)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.1 * (attempt + 1))


def export(reference, public, dataset):
    """Generate a complete sibling tree; failed exports leave the published tree intact."""
    reference, public = Path(reference).resolve(), Path(public).absolute()
    if public.is_symlink():
        raise ValueError("Export destination must not be a symbolic link")
    public = public.resolve()
    if public == reference or public in reference.parents or reference in public.parents:
        raise ValueError("Export destination must be separate from retained sources")
    public.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{public.name}-export-", dir=public.parent))
    candidate, previous = temporary / "next", temporary / "previous"
    preserve = False
    try:
        build_dataset(reference, candidate, dataset)
        existed = public.exists()
        if existed:
            replace_directory(public, previous)
        try:
            replace_directory(candidate, public)
        except BaseException as failure:
            if existed:
                try:
                    replace_directory(previous, public)
                except OSError as restore_error:
                    preserve = True
                    failure.add_note(f"Previous export retained at {previous}: {restore_error}")
            raise
    finally:
        if not preserve:
            shutil.rmtree(temporary)


if __name__ == "__main__":
    dataset = selected_dataset()
    export(*DATASETS[dataset], dataset)
