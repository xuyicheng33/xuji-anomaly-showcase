import sys, json, re, hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.data import ROOT, PUBLIC, dataset_arrays, save_experiment
from openpyxl import load_workbook
import numpy as np
import torch

PUBLIC.mkdir(parents=True, exist_ok=True)
catalog = {"datasets": {}}
models = [
    {
        "id": "model1",
        "name": "STAM-AD",
        "title": "双分支时序模型",
        "detail": "Global / Local TCN + Transformer · 周期掩码 · 有界异常损失",
        "note": "全局长期模式与局部突变共同重建",
    },
    {
        "id": "model2",
        "name": "SMST-AD",
        "title": "多尺度时空模型",
        "detail": "多尺度 TCN · 空间注意力 · 相关性掩码",
        "note": "当前权重版本的解码器使用时间特征；空间融合未接入输出",
    },
    {
        "id": "model3",
        "name": "STMem-AD",
        "title": "时空记忆模型",
        "detail": "时间与空间记忆 · 正常原型检索 · 稀疏与多样性损失",
        "note": "历史权重未保存记忆向量，实时推理使用单独保存的本地校准记忆",
    },
]
original = load_workbook(
    ROOT / "data/source/dataset/converter.xlsx", read_only=True, data_only=True
)
mapping = {
    str(r[1]): dict(originalName=str(r[0]), code=str(r[1]), pointId=str(r[2]))
    for r in original["Sheet6"].values
    if r[1]
}
rows = original["Sheet8"].values
raw_header = list(next(rows))
all_rows = list(rows)
raw_np = np.array(
    [
        [float(v) if isinstance(v, (float, int)) else np.nan for v in r[1:]]
        for r in all_rows
    ]
)
original.close()
clean = load_workbook(
    ROOT / "data/source/dataset/orgdata/converternew.xlsx",
    read_only=True,
    data_only=True,
)
clean_header = list(next(clean.active.values))[1:]
clean.close()
translations = {
    "DC CONVERTER NEUTRAL VOLTAGE": "换流器中性点电压",
    "DC CONVERTER MID VOLTAGE": "换流器中点电压",
    "DC CONVERTER HIGH VOLTAGE": "换流器高端电压",
}
dictionary = []
for i, code in enumerate(clean_header):
    item = mapping.get(
        str(code), dict(code=str(code), originalName=str(code), pointId="")
    )
    item = dict(
        item, index=i, name=translations.get(item["originalName"], item["originalName"])
    )
    dictionary.append(item)
for ds in ["converter", "xuji"]:
    train, test, label = dataset_arrays(ds)
    d = PUBLIC / ds
    d.mkdir(exist_ok=True)
    if ds == "xuji":
        lo = train.min(0)
        hi = train.max(0)
        train_display = (train - lo) / np.maximum(hi - lo, 1e-8)
        test_display = (test - lo) / np.maximum(hi - lo, 1e-8)
    else:
        train_display, test_display = train, test
    train_display.astype("float32").tofile(d / "train.bin")
    test_display.astype("float32").tofile(d / "clean.bin")
    cols = (
        dictionary
        if ds == "converter"
        else [
            dict(
                index=i,
                name=f"变量 {i+1}",
                code=f"X{i+1}",
                originalName="字段字典待补齐",
                pointId="",
            )
            for i in range(7)
        ]
    )
    if ds == "converter":
        selected = [
            raw_header.index(item["code"]) - 1 if item["code"] in raw_header else 0
            for item in cols
        ]
        raw = raw_np[:, selected]
        finite = raw[np.isfinite(raw)]
        # A genuine gap fragment, selected for a variable with missing readings.
        candidates = np.argwhere(~np.isfinite(raw))
        if len(candidates):
            t, c = candidates[len(candidates) // 2]
            start = max(0, int(t) - 12)
            c = int(c)
        else:
            start = 200
            c = 0
        values = raw[start : start + 32, c]
        valid = np.isfinite(values)
        filled = (
            np.interp(np.arange(len(values)), np.where(valid)[0], values[valid])
            if valid.any()
            else np.zeros(len(values))
        )
        smooth = np.convolve(
            np.pad(filled, (2, 2), mode="edge"),
            np.array([1, 2, 3, 2, 1]) / 9,
            mode="valid",
        )
        preview = dict(
            feature=c,
            start=start,
            raw=[float(v) if np.isfinite(v) else None for v in values],
            filled=filled.tolist(),
            smoothed=smooth.tolist(),
            method="本机线性缺失补齐 + 五点加权平滑",
            source="原始Sheet8片段，本地处理",
        )
        raw_view = {
            str(i): [float(v) if np.isfinite(v) else None for v in raw[700:1200, i]]
            for i in range(len(cols))
        }
        # Original timestamps are exact; cleaned arrays lack an audited row mapping.
        raw_time = [str(r[0]) for r in all_rows[700:1200]]
        info = dict(
            name="换流设备监测数据",
            short="换流设备",
            features=125,
            train=5593,
            test=2397,
            total=7990,
            split=0.7,
            originalRows=8760,
            sampling="原始采样间隔 1 小时",
            period="原始记录 2022 年",
            timeStatus="建模序列按索引展示；原始与建模时间映射待核对",
            rawView=raw_view,
            rawTime=raw_time,
            preprocess=preview,
            missing=int((~np.isfinite(raw_np)).sum()),
            discarded=int(np.isnan(raw_np).all(0).sum()),
        )
    else:
        info = dict(
            name="风电功率相关数据",
            short="风电功率",
            features=7,
            train=7007,
            test=1752,
            total=8759,
            split=0.8,
            originalRows=None,
            sampling="研究目标粒度 15 分钟",
            period="报告范围 2025 年 4–7 月",
            timeStatus="当前数组未附时间戳，使用序列索引",
            rawView={str(i): test[:500, i].tolist() for i in range(7)},
            rawTime=[],
            preprocess=None,
            missing=0,
            discarded=None,
        )
    info.update(
        dictionary=cols,
        models=models,
        experiments=[],
        trainFile="/data/" + ds + "/train.bin",
        cleanFile="/data/" + ds + "/clean.bin",
    )
    catalog["datasets"][ds] = info
    if ds == "converter":
        for model in models:
            mid = model["id"]
            p = ROOT / "data/source/results/converter" / mid
            arrays = {
                name: np.load(p / (name + ".npy"))
                for name in ["testRaw", "recon", "lossPerFeat", "lossFinal", "labels"]
            }
            tx = (p / "viz_best.py").read_text(errors="replace")
            match = re.search(
                r"^(?:FIXED_THRESHOLD|THRESHOLD)\s*=\s*([\d.eE+-]+)", tx, re.M
            )
            threshold = (
                float(match.group(1))
                if match
                else float(np.quantile(arrays["lossFinal"], 0.95))
            )
            ckpt = torch.load(
                ROOT / "data/models/converter" / mid / "model.ckpt",
                map_location="cpu",
                weights_only=False,
            )
            history = [
                dict(epoch=i + 1, loss=float(v[0]), lr=float(v[1]))
                for i, v in enumerate(ckpt.get("accuracy_list", []))
            ]
            # Matrix labels are not in viz files; retrieve separately when available.
            matrix_path = ROOT / "data/source/results/converter" / mid / "matrix.npy"
            y = np.load(matrix_path) if matrix_path.exists() else arrays["labels"]
            meta = save_experiment(
                ds,
                "historical-" + mid,
                arrays["testRaw"],
                arrays["recon"],
                y,
                threshold,
                "历史保存结果",
                mid,
                history,
                "研究服务器保存数组",
                score=arrays["lossFinal"],
                per_feature=arrays["lossPerFeat"],
                extra=dict(
                    thresholdSource="历史绘图脚本固定阈值（扫描选择）",
                    scoreMethod="离线重叠窗口误差聚合",
                    memoryStatus="历史回放",
                    checkpointBytes=(
                        ROOT / "data/models/converter" / mid / "model.ckpt"
                    )
                    .stat()
                    .st_size,
                    hasFeatureLabels=matrix_path.exists(),
                ),
            )
            info["experiments"].append(meta)
(PUBLIC / "catalog.json").write_text(
    json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("Exported catalog and real arrays")
