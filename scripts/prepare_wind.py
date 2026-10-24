"""Prepare locally normalized wind experiments without replacing historical weights."""

import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import torch
from server.data import ROOT, PUBLIC, save_experiment, catalog
from server.compute import fit
from server.research import memory_state

cat = catalog()
cat["datasets"]["xuji"]["experiments"] = []
for mid in ["model1", "model2", "model3"]:
    print("Normalized local fit", mid, flush=True)
    model, raw, recon, matrix, threshold, history, seconds, train_rows = fit(
        "xuji", mid, 3, 128, 42
    )
    folder = ROOT / "data/models/xuji" / mid
    folder.mkdir(parents=True, exist_ok=True)
    torch.save(
        dict(
            model_state_dict=model.state_dict(),
            memory_state=memory_state(model),
            epoch=2,
            accuracy_list=[(h["loss"], h["lr"]) for h in history],
            preprocessing=model.preprocessing,
        ),
        folder / "local.ckpt",
    )
    info = dict(
        threshold=threshold,
        window=64,
        source="本地训练 · 训练集min–max · 3轮128窗口",
        thresholdSource="训练窗口末点误差99%分位数",
        preprocessing=model.preprocessing,
    )
    (folder / "live.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta = save_experiment(
        "xuji",
        "normalized-" + mid,
        raw,
        recon,
        matrix,
        threshold,
        "本地归一化训练 · 3 轮",
        mid,
        history,
        source="现存7特征数据，归一化后本地独立训练",
        extra=dict(
            scoreMethod="当前窗口末点误差",
            hasFeatureLabels=True,
            trainSamples=128,
            trainRows=train_rows,
            trainingSeconds=seconds,
            preprocessing=model.preprocessing,
            checkpointBytes=(folder / "local.ckpt").stat().st_size,
        ),
    )
    cat["datasets"]["xuji"]["experiments"].append(meta)
    print("Ready", mid, meta["metrics"]["direct"], flush=True)
(PUBLIC / "catalog.json").write_text(
    json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8"
)
