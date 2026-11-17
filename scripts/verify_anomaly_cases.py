"""Verify shipped cases independently of the authoring UI and remote runtime."""

import hashlib
import json
from pathlib import Path

import numpy as np
from dataset_paths import selected_paths
from result_catalog import registered_files


def read(folder, asset):
    raw = (folder / asset["file"]).read_bytes()
    assert len(raw) == asset["bytes"]
    assert hashlib.sha256(raw).hexdigest() == asset["sha256"]
    a = np.frombuffer(raw, "<f8").reshape(asset["shape"])
    assert np.isfinite(a).all()
    return a


def verify(REFERENCE, ROOT, published=None):
    published = published or json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    window = published["window"]
    asset = published["cases"]
    payload = (ROOT / asset["file"]).read_bytes()
    assert len(payload) == asset["bytes"]
    assert hashlib.sha256(payload).hexdigest() == asset["sha256"]
    manifest = json.loads(payload)
    clean = np.fromfile(REFERENCE / "clean-test.bin", dtype="<f8").reshape(
        -1, len(published["features"])
    )
    reference = json.loads(
        (REFERENCE / ("cases/" + published["models"][0]["id"] + ".json")).read_text(
            encoding="utf-8"
        )
    )
    masks = {c["id"]: np.asarray(c["mask"]) for c in reference["cases"]}
    used = {asset["file"]}
    expected = {
        f"{mode}-{kind}"
        for mode in ["replace", "blend"]
        for kind in ["reference", "uniform", "peak", "length"]
    }
    assert {c["id"] for c in manifest["cases"]} == expected
    for c in manifest["cases"]:
        values = {
            k: read(ROOT, c[k])
            for k in ["original", "material", "candidate", "weights", "input", "labels"]
        }
        used.update(c[k]["file"] for k in values)
        original, candidate, weights, x, labels = (
            values[k] for k in ["original", "candidate", "weights", "input", "labels"]
        )
        np.testing.assert_array_equal(original, clean[c["start"] : c["start"] + window])
        np.testing.assert_allclose(
            x, (1 - weights) * original + weights * candidate, rtol=0, atol=1e-14
        )
        assert set(np.unique(labels)) <= {0, 1}
        assert set(np.unique(masks[c["id"]])) == {0, 1}
        span = window // 4
        assert np.all((masks[c["id"]] == 0).sum(0) == span)
        assert np.all(weights >= 0) and np.all(weights <= 1)
        assert np.all(np.abs(x - original)[labels == 0] < 1e-12)
        features = c["features"]
        begin, end = c["begin"], c["end"]
        if c["kind"] == "peak":
            peak, patch = c["source"]["peak"], c["source"]["patchSize"]
            changed = np.any(np.abs(x - original) > 1e-12, axis=1)
            assert changed.sum() == 1 and changed[peak]
            np.testing.assert_array_equal(
                np.flatnonzero(labels.any(1)),
                np.arange(max(0, peak - patch), min(window, peak + patch + 1)),
            )
        else:
            np.testing.assert_array_equal(np.flatnonzero(labels.any(1)), np.arange(begin, end))
        if c["kind"] == "length":
            scale = c["source"]["scale"]
            np.testing.assert_array_equal(
                candidate[begin:end, features],
                np.repeat(
                    original[c["source"]["sourceBegin"] : c["source"]["sourceEnd"], features],
                    scale,
                    axis=0,
                ),
            )
            np.testing.assert_array_equal(x[end:], original[end:])
        if c["kind"] == "uniform":
            assert np.all(np.ptp(candidate[begin:end, features], axis=0) == 0)
        if c["kind"] == "reference":
            start = c["source"]["referenceStart"]
            np.testing.assert_array_equal(
                candidate[begin:end, features],
                1 - clean[start : start + end - begin, features][::-1],
            )
        for model in c["models"]:
            recon = read(ROOT, model["recon"])
            used.add(model["recon"]["file"])
            scores = ((x - recon) ** 2).mean(1)
            np.testing.assert_allclose(scores, model["scores"], rtol=0, atol=1e-14)
            source_model = next(m for m in published["models"] if m["id"] == model["id"])
            assert model["threshold"] == source_model["windowThreshold"]
            y, p = labels.any(1), scores > model["threshold"]
            counts = dict(
                tp=int((y & p).sum()),
                fp=int((~y & p).sum()),
                fn=int((y & ~p).sum()),
                tn=int((~y & ~p).sum()),
            )
            for key, value in counts.items():
                assert value == model["metrics"][key]
            tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
            assert model["metrics"]["precision"] == (tp / (tp + fp) if tp + fp else None)
            assert model["metrics"]["recall"] == (tp / (tp + fn) if tp + fn else None)
            assert model["metrics"]["f1"] == (
                2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
            )
        print("PASS", c["id"], "source, material, composition, labels, masks and all model outputs")
    actual = {
        p.relative_to(ROOT).as_posix()
        for p in (ROOT / "anomaly-cases-v1").rglob("*")
        if p.is_file()
    }
    other = {name for name in registered_files(ROOT) if "anomaly-cases-v1" in Path(name).parts}
    if REFERENCE.name in ("converter1", "converter2", "wind1", "wind2"):
        assert used <= actual
    else:
        assert actual == used | other, {
            "extra": sorted(actual - used - other),
            "missing": sorted(used - actual),
        }
    # Averaging can cancel opposing residuals; RMS retains the actual anomaly energy.
    x = np.array([[1.0, -1.0]])
    recon = np.zeros_like(x)
    assert (x.mean() - recon.mean()) ** 2 == 0
    assert ((x - recon) ** 2).mean() == 1
    print("PASS mean curves must not substitute for mean squared reconstruction error")


if __name__ == "__main__":
    verify(*selected_paths())
