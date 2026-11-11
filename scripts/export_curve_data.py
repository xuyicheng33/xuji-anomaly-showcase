"""Exact float64 column files and window inputs for low-bandwidth curve loading."""

import json
from pathlib import Path

from array_assets import curve_columns, read_array, write_array
from data_geometry import INPUT_CHUNK_ROWS
from dataset_paths import selected_paths

ROOT = Path(__file__).resolve().parents[1] / "public/data/journey"
REFERENCE = ROOT.parents[2] / "data/reference"


def main(reference=REFERENCE, public=ROOT):
    data = json.loads((reference / "manifest.json").read_text(encoding="utf8"))
    assets = [
        data["input"],
        data["datasets"]["train"],
        data["labelMatrix"],
        *(m["recon"] for m in data["models"]),
    ]
    written = 0
    for asset in assets:
        values = read_array(reference, asset)
        folder = public / "curves-v1" / asset["sha256"]
        folder.mkdir(parents=True, exist_ok=True)
        include_mean = asset["sha256"] not in (
            data["datasets"]["train"]["sha256"],
            data["labelMatrix"]["sha256"],
        )
        for name, column in curve_columns(values, include_mean):
            write_array(folder, f"{name}.bin", column)
            written += 1
        if not include_mean:
            (folder / "mean.bin").unlink(missing_ok=True)
    values = read_array(reference, data["input"])
    folder = public / "input-rows-v2" / data["input"]["sha256"]
    folder.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(values), INPUT_CHUNK_ROWS):
        write_array(folder, f"{start}.bin", values[start : start + INPUT_CHUNK_ROWS])
        written += 1
    print(
        json.dumps(
            {
                "files": written,
                "fullInputBytes": values.nbytes,
                "curveBytes": len(values) * 8,
                "inputRowChunkBytes": INPUT_CHUNK_ROWS * values.shape[1] * 8,
            }
        )
    )


if __name__ == "__main__":
    main(*selected_paths())
