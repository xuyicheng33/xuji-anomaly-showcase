"""Verify every registered result, native precision and its original source chain."""

import hashlib
import json

import numpy as np
from array_assets import read_array
from dataset_paths import DATASETS, retained_path
from release_validation import validate_evaluation
from result_catalog import results
from verify_anomaly_cases import verify as verify_cases
from verify_runtime import verify as verify_runtime
from verify_windows import verify as verify_windows


def verify():
    total = 0
    for result in results():
        reference = retained_path(result["reference"])
        public = DATASETS[result["dataset"]][1]
        data = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
        published = json.loads((public / result["manifest"]["file"]).read_text(encoding="utf8"))
        validate_evaluation(
            public,
            reference / "manifest.json",
            result["manifest"]["file"],
            result["evaluation"]["file"],
        )
        for source in result["sources"]:
            path = retained_path(source["local"])
            assert path.stat().st_size == source["bytes"]
            assert hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"]
        for name, checksum in result["published"].items():
            assert hashlib.sha256((public / name).read_bytes()).hexdigest() == checksum, name
        model = data["models"][0]
        source_path = retained_path("data/source/results-v1/" + result["id"])
        raw = read_array(reference, data["input"])
        assert np.array_equal(raw, np.load(source_path / "viz/data/testRaw.npy"))
        assert np.array_equal(data["labels"], np.load(source_path / "viz/data/labels.npy"))
        processed = source_path / (
            "processed/converter/converter_train.npy"
            if result["dataset"] == "converter"
            else "processed/xuji_28/xuji_28_train.npy"
        )
        assert np.array_equal(read_array(reference, data["normalizedTrain"]), np.load(processed))
        native = reference / "native"
        index = json.loads((native / "index.json").read_text(encoding="utf8"))
        hashes = {
            name: hashlib.sha256(bytes.fromhex(index[name]["header"]))
            for name in ("predictions.npy", "errors.npy")
        }
        recon, errors = np.zeros_like(raw), np.zeros_like(raw)
        masks = np.load(native / "masks.npy", mmap_mode="r")
        scores = np.load(native / "window-scores.npy", mmap_mode="r")
        for prediction_chunk, error_chunk, browser_chunk in zip(
            index["predictions.npy"]["chunks"],
            index["errors.npy"]["chunks"],
            model["windows"]["chunks"],
            strict=True,
        ):
            values = read_array(native, prediction_chunk)
            squared = read_array(native, error_chunk)
            for name, chunk in [("predictions.npy", prediction_chunk), ("errors.npy", error_chunk)]:
                hashes[name].update((native / chunk["file"]).read_bytes())
            start, count = prediction_chunk["start"], prediction_chunk["count"]
            browser_values = read_array(
                reference, {**browser_chunk, "shape": list(values.shape)}, "<f4"
            )
            assert np.array_equal(values.astype("<f4"), browser_values)
            saved_mask = np.fromfile(
                reference
                / model["windows"]["maskDirectory"]
                / (reference / browser_chunk["file"]).name,
                "uint8",
            ).reshape(values.shape)
            assert np.array_equal(saved_mask, masks[start : start + count])
            for offset, prediction in enumerate(values):
                row = start + offset
                losses = (raw[row : row + data["window"]] - prediction) ** 2
                assert np.array_equal(losses, squared[offset])
                assert np.array_equal(losses.mean(1), scores[row])
                recon[row : row + data["window"]] += prediction
                errors[row : row + data["window"]] += losses
        for name, hash_value in hashes.items():
            assert hash_value.hexdigest() == index[name]["sha256"], name
        coverage = np.asarray(model["coverage"])[:, None]
        assert np.array_equal(recon / coverage, np.load(native / "recon.npy"))
        assert np.array_equal(errors / coverage, np.load(native / "lossPerFeat.npy"))
        native_scores = (errors / coverage).mean(1)
        assert np.array_equal(native_scores, np.load(native / "lossFinal.npy"))
        assert np.array_equal(
            native_scores > model["threshold"], np.asarray(model["scores"]) > model["threshold"]
        )
        for name, descriptor in index.items():
            if "file" in descriptor:
                assert (
                    hashlib.sha256((reference / descriptor["file"]).read_bytes()).hexdigest()
                    == descriptor["sha256"]
                )
        cases = json.loads(
            (reference / "cases" / f"{model['id']}.json").read_text(encoding="utf8")
        )["cases"]
        for case in cases:
            assert np.array_equal(
                case["recon"],
                np.load(native / "cases" / f"{case['id']}.npy").astype("<f4").astype(float),
            )
        verify_windows(reference, public, published)
        verify_runtime(reference, public, published)
        verify_cases(reference, public, published)
        total += model["windows"]["count"]
        print(
            f"PASS {result['id']}: native float64, browser float32, source snapshots and all displays"
        )
    assert total == 9782
    print(f"PASS all four results: {total} complete windows and 32 controlled cases")


if __name__ == "__main__":
    verify()
