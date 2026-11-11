"""Derive per-window scores from the published outputs, without running inference."""

import hashlib
import json
from pathlib import Path

import numpy as np
from array_assets import read_array, window_scores, write_array
from data_geometry import CALCULATION_CHUNK_ROWS, geometry
from dataset_paths import selected_paths

ROOT = Path(__file__).resolve().parents[1] / "public/data/journey"
REFERENCE = ROOT.parents[2] / "data/reference"


def main(reference=REFERENCE, public=ROOT):
    data = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
    _, features, window = geometry(data)
    source = read_array(reference, data["input"])
    target = public / "calculation-v2"
    target.mkdir(parents=True, exist_ok=True)
    manifest = {
        "resultVersion": data["resultVersion"],
        "window": window,
        "features": features,
        "models": {},
    }
    for model in data["models"]:
        scores = np.empty((model["windows"]["count"], window), dtype="<f8")
        for chunk in model["windows"]["chunks"]:
            recon = np.fromfile(reference / chunk["file"], dtype="<f4").reshape(
                chunk["count"], window, features
            )
            for local in range(chunk["count"]):
                start = chunk["start"] + local
                scores[start] = window_scores(source[start : start + window], recon[local])
        total = np.zeros(len(source))
        coverage = np.zeros(len(source), dtype=int)
        for start, row in enumerate(scores):
            total[start : start + window] += row
            coverage[start : start + window] += 1
        difference = float(np.max(np.abs(total / coverage - model["scores"])))
        assert difference < 1e-12, difference
        assert coverage.tolist() == model["coverage"]
        # A source-time row contains scores in ascending covering-window order.
        # Float64 values are copied exactly; only unused edge slots are zero-filled.
        by_time = np.zeros((len(source), window), dtype="<f8")
        for index in range(len(source)):
            starts = np.arange(max(0, index - window + 1), min(index + 1, len(scores)))
            by_time[index, : len(starts)] = scores[starts, index - starts]
        chunks = []
        for start in range(0, len(source), CALCULATION_CHUNK_ROWS):
            values = by_time[start : start + CALCULATION_CHUNK_ROWS]
            asset = write_array(public, f"calculation-v2/{model['id']}/{start}.bin", values)
            chunks.append({**asset, "start": start, "count": len(values)})
        manifest["models"][model["id"]] = {"chunks": chunks, "maxAggregateDifference": difference}
    payload = (json.dumps(manifest, indent=2) + "\n").encode("utf8")
    (target / "manifest.json").write_bytes(payload)
    print(
        f"Calculation index: {len(manifest['models'])} models, source-time chunks of {CALCULATION_CHUNK_ROWS} rows"
    )
    return dict(
        file="calculation-v2/manifest.json",
        bytes=len(payload),
        sha256=hashlib.sha256(payload).hexdigest(),
    )


if __name__ == "__main__":
    main(*selected_paths())
