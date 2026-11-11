"""Publish only the exact data and indexes used by the browser."""

import hashlib
import json

import numpy as np
from array_assets import curve_columns, read_array, write_array
from data_geometry import CONTRIBUTION_CHUNK_ROWS, INPUT_CHUNK_ROWS, geometry
from dataset_paths import dataset_info, selected_paths
from export_calculation_index import main as export_calculation
from install_anomaly_cases import install as install_cases


def window_integrity(reference, chunk, window, features):
    predictions = read_array(
        reference, {**chunk, "shape": [chunk["count"], window, features]}, "<f4"
    )
    hashes = [hashlib.sha256(values.tobytes()).digest() for values in predictions]
    # Each covering-row request follows window-start order within this chunk.
    for index in range(chunk["count"] + window - 1):
        rows = b"".join(
            predictions[start, index - start].tobytes()
            for start in range(max(0, index - window + 1), min(index + 1, chunk["count"]))
        )
        hashes.append(hashlib.sha256(rows).digest())
    return np.frombuffer(b"".join(hashes), dtype="uint8").reshape(-1, 32)


def runtime_manifest(source, reference, public):
    rows, features, window = geometry(source)
    result = {
        key: source[key]
        for key in (
            "schemaVersion",
            "resultVersion",
            "window",
            "features",
            "times",
            "labels",
            "input",
            "labelMatrix",
            "summary",
            "removedFeatures",
        )
    }
    result["dataset"] = dataset_info(source)
    for key in ("normalization",):
        if key in source:
            result[key] = source[key]

    def with_curves(asset, include_mean):
        values = read_array(reference, asset)
        folder = public / "curves-v1" / asset["sha256"]
        curves = {
            name: write_array(folder, f"{name}.bin", column)["sha256"]
            for name, column in curve_columns(values, include_mean)
        }
        return {**asset, "curves": curves}

    result["input"] = with_curves(source["input"], True)
    result["labelMatrix"] = with_curves(source["labelMatrix"], False)
    result["datasets"] = {"train": with_curves(source["datasets"]["train"], False)}
    time_payload = (
        json.dumps(source["datasets"]["train"]["times"], separators=(",", ":")) + "\n"
    ).encode("utf8")
    time_asset = dict(
        file="training-times-v1.json",
        bytes=len(time_payload),
        sha256=hashlib.sha256(time_payload).hexdigest(),
    )
    (public / time_asset["file"]).write_bytes(time_payload)
    result["datasets"]["train"]["times"] = time_asset
    result["models"] = []
    result["inputChunkRows"] = INPUT_CHUNK_ROWS
    labels = np.asarray(source["labels"], dtype=bool)
    raw = read_array(reference, source["input"])
    result["inputRowHashes"] = [
        write_array(
            public,
            f"input-rows-v2/{source['input']['sha256']}/{start}.bin",
            raw[start : start + INPUT_CHUNK_ROWS],
        )["sha256"]
        for start in range(0, rows, INPUT_CHUNK_ROWS)
    ]
    for model in source["models"]:
        current = {
            key: model[key]
            for key in (
                "id",
                "name",
                "threshold",
                "windowThreshold",
                "scores",
                "history",
                "recon",
                "metrics",
                "run",
            )
        }
        current["recon"] = with_curves(model["recon"], True)
        window_chunks = []
        for chunk in model["windows"]["chunks"]:
            hashes = window_integrity(reference, chunk, window, features)
            integrity = write_array(
                public, f"windows-integrity-v1/{model['id']}/{chunk['start']}.bin", hashes, "uint8"
            )
            window_chunks.append({**chunk, "integrity": integrity})
        current["windows"] = dict(
            chunks=window_chunks, count=model["windows"]["count"], length=window, features=features
        )
        errors = read_array(reference, model["errors"])
        chunks = []
        for start in range(0, rows, CONTRIBUTION_CHUNK_ROWS):
            values = errors[start : start + CONTRIBUTION_CHUNK_ROWS]
            asset = write_array(public, f"contributions-v1/{model['id']}/{start}.bin", values)
            del asset["shape"]
            chunks.append(
                {
                    "start": start,
                    "count": len(values),
                    **asset,
                }
            )
        current["contributions"] = {"chunks": chunks, "features": features}
        current["focusFeatures"] = errors.argmax(axis=1).tolist()
        current["examples"] = []
        for example in model["examples"]:
            start = example["start"]
            chunk = next(
                c
                for c in model["windows"]["chunks"]
                if c["start"] <= start < c["start"] + c["count"]
            )
            recon = np.fromfile(reference / chunk["file"], dtype="<f4").reshape(
                -1, window, features
            )[start - chunk["start"]]
            squared = (raw[start : start + window] - recon.astype(float)) ** 2
            prediction = squared.mean(axis=1) > model["windowThreshold"]
            code = example["code"]
            matches = (labels[start : start + window] == (code in ("tp", "fn"))) & (
                prediction == (code in ("tp", "fp"))
            )
            candidates = np.flatnonzero(matches)
            if not len(candidates):
                raise ValueError(f"{model['id']} example {code} has no matching point")
            # Preserve the selected point when valid; otherwise choose the closest actual outcome.
            point = int(candidates[np.argmin(abs(candidates - (example["index"] - start)))])
            feature = (
                example["feature"]
                if start + point == example["index"]
                else int(squared[point].argmax())
            )
            current["examples"].append({**example, "index": start + point, "feature": feature})
        result["models"].append(current)
    return result


def export(reference, public):
    source = json.loads((reference / "manifest.json").read_text(encoding="utf-8"))
    public.mkdir(parents=True, exist_ok=True)
    result = runtime_manifest(source, reference, public)
    result["cases"] = install_cases(
        reference / "cases", public / "anomaly-cases-v1", reference / "manifest.json"
    )
    result["calculation"] = export_calculation(reference, public)
    (public / "manifest.json").write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"Runtime manifest: {(public / 'manifest.json').stat().st_size} bytes")


if __name__ == "__main__":
    export(*selected_paths())
