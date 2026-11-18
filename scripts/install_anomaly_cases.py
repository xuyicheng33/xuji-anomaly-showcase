"""Verify retained case outputs and publish the exact static display package."""

import hashlib
import json
from pathlib import Path

import numpy as np
from case_construction import construct
from dataset_paths import dataset_info
from evaluation_policy import counts


def install(source, target, journey):
    source, target = Path(source), Path(target)
    target.mkdir(parents=True, exist_ok=True)
    data = json.loads(Path(journey).read_text(encoding="utf-8"))
    exports = {
        m: json.loads((source / f"{m}.json").read_text(encoding="utf-8"))
        for m in [v["id"] for v in data["models"]]
    }
    clean = np.fromfile(Path(journey).parent / "clean-test.bin", dtype="<f8").reshape(
        -1, len(data["features"])
    )
    expected = {
        c["id"]: c
        for c in construct(
            clean,
            list(range(len(data["features"]))) if dataset_info(data)["id"] == "wind" else None,
            window=data["window"],
        )
    }
    records = []
    assets = {}

    def asset(name, value):
        a = np.asarray(value, dtype="<f8")
        payload = a.tobytes()
        digest = hashlib.sha256(payload).hexdigest()
        key = (digest, a.shape)
        if key in assets:
            return assets[key]
        p = target / (name + ".bin")
        p.write_bytes(payload)
        assets[key] = dict(
            file="anomaly-cases-v1/" + p.name,
            shape=list(a.shape),
            bytes=len(payload),
            sha256=digest,
        )
        return assets[key]

    first_id = data["models"][0]["id"]
    first = exports[first_id]["cases"][0]
    original = asset("original", first["original"])
    names = {"reference": "参考片段", "uniform": "均匀值", "peak": "峰值噪声", "length": "长度调整"}
    for c in exports[first_id]["cases"]:
        cid = c["id"]
        other = next(v for v in exports[data["models"][-1]["id"]]["cases"] if v["id"] == cid)
        for key in ["original", "candidate", "weights", "input", "labels", "mask"]:
            assert np.array_equal(c[key], other[key]), (cid, key, "model input differs")
            np.testing.assert_allclose(c[key], expected[cid][key], rtol=0, atol=1e-14)
        x, original_values, labels = (np.asarray(c[k]) for k in ["input", "original", "labels"])
        assert np.all(np.abs(x - original_values)[labels == 0] < 1e-12)
        rec = {
            k: c[k]
            for k in [
                "id",
                "insertion",
                "kind",
                "start",
                "begin",
                "end",
                "feature",
                "features",
                "source",
            ]
        }
        material = np.asarray(c["original"]).copy()
        if c["kind"] == "reference":
            start = c["source"]["referenceStart"]
            material[c["begin"] : c["end"], c["features"]] = clean[
                start : start + c["end"] - c["begin"], c["features"]
            ]
        rec.update(
            name=("替换" if c["insertion"] == "replace" else "混合") + "：" + names[c["kind"]],
            times=data["times"][c["start"] : c["start"] + len(c["original"])],
            original=original,
            material=asset(cid + "-material", material),
            **{k: asset(cid + "-" + k, c[k]) for k in ["candidate", "weights", "input", "labels"]},
        )
        rec["models"] = []
        for m in data["models"]:
            raw = next(v for v in exports[m["id"]]["cases"] if v["id"] == cid)
            recon = np.asarray(raw["recon"])
            errors = (x - recon) ** 2
            np.testing.assert_allclose(raw["scores"], errors.mean(1), rtol=0, atol=1e-14)
            np.testing.assert_allclose(raw["errors"], errors, rtol=0, atol=1e-14)
            threshold = m["windowThreshold"]
            rec["models"].append(
                dict(
                    id=m["id"],
                    name=m["name"],
                    recon=asset(cid + "-" + m["id"], recon),
                    scores=errors.mean(1).tolist(),
                    threshold=threshold,
                    metrics=counts(labels.any(1), errors.mean(1) > threshold),
                )
            )
        records.append(rec)
    manifest = dict(
        version=next(iter(exports.values()))["version"],
        seed=20261028,
        cases=records,
        provenance={
            m: {"sources": e["sources"], "device": e["device"], "policy": e["policy"]}
            for m, e in exports.items()
        },
        construction="Four candidate generators crossed with replacement / 0.7 blending. Controlled new offline cases, not historical static/dynamic combinations.",
        lengthPolicy=f"Repeat {(first['end'] - first['begin']) // 3} points by scale 3 inside a {first['end'] - first['begin']}-point interval; no tail shift or unlabelled feature changes.",
        thresholdPolicy="Reuse frozen independent-window thresholds; never optimize on these eight cases.",
    )
    payload = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    (target / "manifest.json").write_bytes(payload)
    print(
        f"PASS {len(records)} cases × {len(data['models'])} models; sources, composition, labels and all feature errors verified"
    )
    return dict(
        file="anomaly-cases-v1/manifest.json",
        bytes=len(payload),
        sha256=hashlib.sha256(payload).hexdigest(),
    )
