"""Import only archived server results. Does not train or invoke server entry points."""
import sys, json, hashlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np
from server.data import ROOT, PUBLIC
from server.analytics import metrics, counts
from server.official import evaluate_archive


def import_archives():
    cat = json.loads((PUBLIC / "catalog.json").read_text(encoding="utf-8"))
    cat["officialOnly"] = True
    cat["datasets"] = {"converter": cat["datasets"]["converter"]}
    dataset = cat["datasets"]["converter"]
    dataset["preprocess"] = None
    dataset["experiments"] = []
    folders = {"model1": "DTAAD_64_n", "model2": "DTAAD_64_n_method_2", "model3": "DTAAD_64_n_method_3"}
    for mid, folder in folders.items():
        source = ROOT / "data/source/results/converter" / mid
        target = PUBLIC / "converter" / ("historical-" + mid)
        meta = json.loads((target / "meta.json").read_text(encoding="utf-8"))
        scores = np.load(source / "lossFinal.npy").reshape(-1)
        labels = np.load(source / "labels.npy").reshape(-1)
        threshold, prediction, threshold_source = evaluate_archive(source / "viz_best.py", scores, labels)
        prediction.tofile(target / "predictions.bin")
        meta["files"]["predictions"] = {"url": "/data/converter/" + meta["id"] + "/predictions.bin", "dtype": "uint8", "shape": list(prediction.shape)}
        meta.update(
            threshold=threshold,
            thresholdSource=threshold_source,
            evaluation="point-adjust",
            official=True,
            name="服务器保存结果 · " + str(len(meta["history"])) + " 轮",
            source="研究服务器 · " + folder + "/viz/data",
            sourcePath="/root/gpufree-data/DTAAD/" + folder + "/viz/data",
            scoreMethod="服务器保存的重叠窗口平均误差",
            metrics=metrics(labels, scores, threshold),
        )
        meta["metrics"]["adjusted"] = counts(labels, prediction)
        meta["sourceHashes"] = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in ["testRaw.npy", "recon.npy", "lossFinal.npy", "lossPerFeat.npy", "labels.npy", "viz_best.py"]}
        meta["exportHashes"] = {key: hashlib.sha256((PUBLIC / info["url"].removeprefix("/data/")).read_bytes()).hexdigest() for key, info in meta["files"].items()}
        (target / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        dataset["experiments"].append(meta)
        print(mid, "threshold", threshold, "PA F1", meta["metrics"]["adjusted"]["f1"], flush=True)
    (PUBLIC / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    import_archives()
