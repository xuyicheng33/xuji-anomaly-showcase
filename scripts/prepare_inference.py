import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np, torch
from server.data import ROOT, dataset_arrays, save_experiment, register
from server.research import (
    create_model,
    freeze,
    predict,
    calibrate_memory,
    memory_state,
)
from server.compute import fit, score_sequence

for dataset in ["converter", "xuji"]:
    train, test, labels = dataset_arrays(dataset)
    for mid in ["model1", "model2", "model3"]:
        folder = ROOT / "data/models" / dataset / mid
        path = folder / "model.ckpt"
        if not path.exists():
            print("Local fitting", dataset, mid, flush=True)
            model, raw, recon, matrix, threshold, history, seconds, train_count = fit(
                dataset, mid, 1, 128, 42
            )
            folder.mkdir(parents=True, exist_ok=True)
            torch.save(
                dict(
                    model_state_dict=model.state_dict(),
                    epoch=0,
                    accuracy_list=[(h["loss"], h["lr"]) for h in history],
                ),
                path,
            )
            meta = save_experiment(
                dataset,
                "local-" + mid,
                raw,
                recon,
                matrix,
                threshold,
                "本地训练 · 1 轮",
                mid,
                history,
                extra=dict(
                    scoreMethod="当前窗口末点误差",
                    hasFeatureLabels=True,
                    trainSamples=128,
                    trainRows=train_count,
                    trainingSeconds=seconds,
                    checkpointBytes=path.stat().st_size,
                ),
            )
            register(meta)
        else:
            checkpoint = torch.load(path, map_location="cpu", weights_only=False)
            model = create_model(mid, train.shape[1], 64)
            model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        if mid == "model3":
            print("Calibrating missing memory", dataset, flush=True)
            calibrate_memory(model, train)
            torch.save(memory_state(model), folder / "memory_state.pt")
        freeze(model)
        ix = np.linspace(model.n_window, len(train) - 1, 64, dtype=int)
        sample = np.stack([train[i - model.n_window + 1 : i + 1] for i in ix])
        predicted = predict(model, mid, sample)[:, -1]
        threshold = float(np.quantile(((predicted - train[ix]) ** 2).mean(1), 0.99))
        note = (
            "历史网络权重；记忆向量在本地训练片段重新校准"
            if mid == "model3"
            else (
                "本地128窗口训练1轮"
                if dataset == "xuji"
                else "历史网络权重，当前窗口推理"
            )
        )
        (folder / "live.json").write_text(
            json.dumps(
                dict(
                    threshold=threshold,
                    window=64,
                    source=note,
                    thresholdSource="训练片段末点误差99%分位数",
                ),
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        if dataset == "xuji" and mid == "model3":
            raw = np.load(
                ROOT
                / "data/source/insertedData/xuji/xuji_test_mergedSeq_after_insert.npy"
            )
            matrix = np.load(ROOT / "data/source/insertedData/xuji/xuji_labels.npy")
            print("Scoring wind input", flush=True)
            recon = score_sequence(model, mid, raw)
            history = [
                dict(epoch=i + 1, loss=float(v[0]), lr=float(v[1]))
                for i, v in enumerate(checkpoint.get("accuracy_list", []))
            ]
            meta = save_experiment(
                dataset,
                "calibrated-model3",
                raw,
                recon,
                matrix,
                threshold,
                "历史网络 · 本地记忆校准",
                mid,
                history,
                source="历史7特征输入与网络，本地校准推理",
                extra=dict(
                    scoreMethod="当前窗口末点误差",
                    hasFeatureLabels=True,
                    memoryStatus="本地校准",
                    checkpointBytes=path.stat().st_size,
                ),
            )
            register(meta)
        print("Ready", dataset, mid, flush=True)
