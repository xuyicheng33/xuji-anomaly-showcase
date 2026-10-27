"""Read existing research artifacts into a self-contained static presentation.

No training, inference, anomaly synthesis, or source-file mutation occurs here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from PIL.PngImagePlugin import PngInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SUPPLEMENT = Path(r"D:\Desktop\学习\许继电气续\02_核心数据\第二批_电站41融合数据")
METEO = ["temperature", "humidity", "pressure", "ws_10", "wd_10", "ws_30", "wd_30", "ws_50", "wd_50", "ws_70", "wd_70", "ws_hub", "wd_hub"]
FEATURES = ["actualvalue", "forecastvalue"] + [prefix + name for prefix in ["weather_", "forecast_"] for name in METEO]
OLD_FEATURES = ["actualvalue", "forecastvalue", "weather_temperature", "weather_ws_10", "weather_ws_30", "weather_ws_50", "weather_ws_70"]
LABELS = {"temperature": "温度", "humidity": "湿度", "pressure": "气压", "actualvalue": "实际功率", "forecastvalue": "预测功率"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def export(supplement: Path) -> None:
    output = ROOT / "public/data"
    assets = ROOT / "public/assets"
    assets.mkdir(parents=True, exist_ok=True)
    sources: list[dict] = []

    def source(key: str, path: Path, title: str, version: str, note: str = "", excerpt: tuple[int, int] | None = None) -> None:
        entry = {"id": key, "title": title, "file": path.name, "version": version, "bytes": path.stat().st_size, "sha256": digest(path), "note": note}
        if path.is_relative_to(ROOT):
            entry["path"] = path.relative_to(ROOT).as_posix()
        else:
            entry["path"] = "补充工作目录/" + path.relative_to(supplement.parents[1]).as_posix()
        if excerpt:
            lines = path.read_text(encoding="utf-8-sig").splitlines()
            start, end = excerpt
            entry["excerpt"] = "\n".join(f"{i + 1}: {lines[i]}" for i in range(start - 1, min(end, len(lines))))
        sources.append(entry)

    final_path = supplement / "第二批_电站41_8759行_extracted_data.csv"
    frame = pd.read_csv(final_path)
    raw_path = supplement / "03_复核生成/03_按时刻融合_保留原始数值与秒.csv"
    raw = pd.read_csv(raw_path)
    values = frame[FEATURES].to_numpy(dtype=float)
    times = pd.to_datetime(frame.forecastvaluetime, format="mixed")
    assert values.shape == (8759, 28) and not np.isnan(values).any()
    assert times.is_unique and times.diff().dropna().eq(pd.Timedelta(minutes=15)).all()
    source("final", final_path, "第二批风电融合表", "28 维 · 8,759 行", "合并表 42 列，模型使用其中 28 列。")
    source("raw-merge", raw_path, "保留秒值的融合记录", "28 维 · 复核记录")
    lineage_path = supplement / "03_复核生成/04_最终每行的分片来源.csv"
    lineage = pd.read_csv(lineage_path).fillna("")
    source("lineage", lineage_path, "逐行分片来源", "8,759 条来源映射")
    changes_path = supplement / "03_复核生成/05_观察到的数值修改.csv"
    changes = pd.read_csv(changes_path).fillna("")
    source("changes", changes_path, "气象数值调整记录", "62 处数值调整", "边界值来自既有最终表；原始阈值推导未保存。")
    review_path = supplement / "03_复核生成/复核结果.json"
    review = json.loads(review_path.read_text(encoding="utf-8"))
    source("review", review_path, "融合复核记录", "只读对照", "复核统计不代表新增检测实验。")

    streams = []
    duplicate_weather = []
    definitions = [
        ("weather", "实测气象", "xuji_station41_304_weather_actual.csv", "datatime", 211, 61365, True),
        ("forecast", "气象预报", "xuji_station41_305_weather_forecast.csv", "datatime", 187, 193920, True),
        ("powerstat", "功率统计", "powerforecast_powerstat_all.csv", "statistictime", 10, 13004, False),
        ("short", "短期功率预测", "xuji_station41_306_power_short.csv", "forecastvaluetime", 199, 206400, True),
        ("ultrashort", "超短期功率预测", "xuji_station41_307_power_ultrashort.csv", "forecast_fromtime", 210, 24324, False),
    ]
    for key, title, filename, timecol, files, count, used in definitions:
        path = supplement / "02_平台原表" / filename
        table = pd.read_csv(path, low_memory=False)
        selected = table[table.stationid == 41]
        dates = pd.to_datetime(selected[timecol], format="mixed", errors="coerce")
        coverage = []
        if used:
            unique_times = pd.Series(dates.dropna().sort_values().unique())
            interval = 5 if key == 'weather' else 15
            groups = unique_times.diff().gt(pd.Timedelta(minutes=interval)).cumsum()
            coverage = [{"start": str(g.min()), "end": str(g.max()), "points": len(g)} for _, g in unique_times.groupby(groups)]
        if key == 'weather':
            candidates = selected[pd.to_datetime(selected.datatime, format='mixed').isin(times)]
            duplicates = candidates[candidates.duplicated(['datatime'] + METEO, keep=False)].sort_values(['datatime', 'id'])
            assert len(duplicates) == 8 and duplicates.datatime.nunique() == 4
            duplicate_weather = duplicates.fillna('').to_dict('records')
        sample_candidates = selected[(dates >= pd.Timestamp('2025-04-02')) & (dates < pd.Timestamp('2025-04-05'))]
        if key == 'weather':
            sample_candidates = sample_candidates[pd.to_datetime(sample_candidates[timecol], format='mixed') >= pd.Timestamp('2025-04-02 18:15')]
        if 'forecast_fromtime' in sample_candidates and key in ['forecast', 'short']:
            batch = pd.to_datetime(sample_candidates.forecast_fromtime, format='mixed', errors='coerce')
            sample_candidates = sample_candidates[batch == pd.Timestamp('2025-04-02')]
            sample_candidates = sample_candidates[pd.to_datetime(sample_candidates[timecol], format='mixed') >= pd.Timestamp('2025-04-02 18:15')]
        sample = (sample_candidates if len(sample_candidates) else selected).head(7).fillna("")
        source(key, path, title + "平台原表", "原始平台表", "按实际保存范围统计；批次截断与站点筛选分开。")
        streams.append({"id": key, "name": title, "files": files, "rawRows": count, "platformRows": len(table), "stationRows": len(selected), "used": used,
                        "start": str(dates.min()), "end": str(dates.max()), "timeColumn": timecol, "columns": table.columns.tolist(), "sample": sample.to_dict("records"), "coverage": coverage})

    captured = ROOT / ".runtime/captured"
    arrays = {}
    for name in ["train", "test", "labels"]:
        path = captured / f"new28_{name}.npy"
        array = np.load(path, allow_pickle=False)
        arrays[name] = array
        source("new-" + name, path, "服务器 28 维 " + name + ".npy", "28 维 · 70/30", "只读取既有数组；远端 DTAAD_64_n1/data/xuji_28/。")
    assert arrays["train"].shape == (6131, 28)
    assert arrays["test"].shape == arrays["labels"].shape == (2628, 28)
    assert not np.count_nonzero(arrays["labels"])
    assert np.allclose(values[:6131], arrays["train"], rtol=1e-6, atol=1e-4)
    assert np.allclose(values[6131:], arrays["test"], rtol=1e-6, atol=1e-4)

    features = []
    for i, key in enumerate(FEATURES):
        bare = key.removeprefix("weather_").removeprefix("forecast_")
        label = LABELS.get(bare)
        if label is None:
            kind, height = bare.split("_")
            label = ("轮毂" if height == "hub" else height + " 米") + ("风速" if kind == "ws" else "风向")
        # Supplied table headers and report do not define physical units.
        unit = ""
        features.append({"key": key, "label": label, "unit": unit, "group": "功率" if i < 2 else "实测气象" if i < 15 else "预报气象", "min": float(values[:6131, i].min()), "max": float(values[:6131, i].max())})

    old = {}
    for folder in ["data", "processed"]:
        path = ROOT / f"data/source/{folder}/xuji/train.npy"
        array = np.load(path, allow_pickle=False)
        old[folder] = array[:160].tolist()
        source("old-" + folder, path, "历史 7 维" + ("原始训练数组" if folder == "data" else "处理后训练数组"), "7 维 · 7,007/1,752", "处理后数值直接取保存数组，含既有处理扰动。")
    inserted = ROOT / "data/source/insertedData/xuji"
    for name, filename in [("values", "xuji_test_mergedSeq_after_insert.npy"), ("labels", "xuji_test_labels_mergedSeq_after_insert.npy")]:
        path = inserted / filename
        arr = np.load(path, allow_pickle=False)
        old["inserted_" + name] = arr.tolist()
        source("old-inserted-" + name, path, "历史固定异常" + ("数值" if name == "values" else "标签"), "7 维 · 1,752 行")
    old["features"] = OLD_FEATURES
    old["positiveCells"] = int(np.count_nonzero(old["inserted_labels"]))
    old["positiveTimes"] = int(np.any(np.array(old["inserted_labels"]), axis=1).sum())
    meta = json.loads((captured / "checkpoint.json").read_text(encoding="utf-8"))
    checkpoint_path = ROOT / "data/models/xuji/model3/model.ckpt"
    source("checkpoint", checkpoint_path, "STMem-AD 历史风电检查点", "7 维 · 窗口 64", "保存 epoch、参数、优化器、调度器和训练记录。")
    old["checkpoint"] = meta
    old["history"] = meta["history"]
    graph_path = captured / 'old7-training.png'
    source('old-training-graph', graph_path, '历史风电训练原图', '7 维 · 服务器保存图', 'DTAAD_64_n_method_3/plots/DTAAD_xuji/training-graph.png')
    (assets / 'old7-training.png').write_bytes(graph_path.read_bytes())

    report = ROOT / "materials/异常检测报告.docx"
    source("report", report, "异常检测报告", "第二批风电 · 第 5.4 节", "报告 28 维成绩与旧版检查点分别登记；第 5.3 节换流设备曲线不用于风电。")
    source('data-report', supplement.parents[1] / '01_报告/新版本报告/异常检测报告_第一章.md', '数据整理与异常检测数据集构建', '第一章 · 数据介绍与提取规则')
    figures = {"anomalies": "image5.png", "stam": "image6.png", "smst": "image62.png", "stmem": "image89.png", "overlap": "image141.png"}
    with zipfile.ZipFile(report) as archive:
        for key, name in figures.items():
            (assets / (key + ".png")).write_bytes(archive.read("word/media/" + name))
    # Crop only the already-saved report panels; do not construct new anomalies.
    image = Image.open(assets / 'anomalies.png')
    for key, bounds in {'original': (0, 175, 410, 510), 'soft': (550, 18, 904, 327), 'uniform': (906, 18, 1267, 327), 'peak': (550, 332, 904, 654), 'length': (906, 332, 1267, 654)}.items():
        image.crop(bounds).save(assets / ('anomaly-' + key + '.png'))
    for path in assets.glob('*.png'):
        origin = {'source': 'DTAAD_64_n_method_3/plots/DTAAD_xuji/training-graph.png', 'sha256': digest(graph_path)} if path.name == 'old7-training.png' else {'source': 'materials/异常检测报告.docx', 'sha256': digest(report), 'figure': '3-2' if path.name.startswith('anomal') else {'stam.png': '4-1', 'smst.png': '4-3', 'stmem.png': '4-4', 'overlap.png': '4-5'}[path.name]}
        origin['operation'] = 'Existing saved image; report panel crop only where named. No image generation.'
        metadata = PngInfo()
        metadata.add_text('impeccable:prompt', json.dumps(origin, ensure_ascii=True))
        with Image.open(path) as saved:
            saved.save(path, pnginfo=metadata)

    code_specs = [
        ("model1", "model1/src/models.py", "STAM-AD 模型", (720, 760)),
        ("model2", "model2/src/models.py", "SMST-AD 模型", (720, 760)),
        ("model3", "model3/src/models.py", "STMem-AD 模型", (720, 760)),
        ("anomaly-code", "model3/demoNew03.py", "四类异常规则", (1, 95)),
        ("window-code", "model3/demo11.py", "不重叠块与标签合并", (1, 100)),
        ("train-code", "model3/newMainV801.py", "训练、前缀滑窗与保存", (27, 52)),
        ("pot-code", "model3/src/pot.py", "阈值与检测评价", (1, 90)),
    ]
    for key, relative, title, excerpt in code_specs:
        path = ROOT / "data/source/research" / relative
        if key.startswith('model'):
            lines = path.read_text(encoding='utf-8-sig').splitlines()
            start = next((i + 1 for i, line in enumerate(lines) if line.startswith('class DTAAD(')), 1)
            excerpt = (start, start + 45)
        elif key == 'pot-code':
            excerpt = (140, 177)
        source(key, path, title, "服务器原始代码", "用于结构与公式展示；本次未执行研究计算。", excerpt)

    report_metrics = [
        {"model": "STAM-AD", "features": 28, "window": 96, "rate": .65, "precision": .8795, "recall": .8475, "f1": .8632, "auc": .9084},
        {"model": "SMST-AD", "features": 28, "window": 96, "rate": .70, "precision": .8222, "recall": .8475, "f1": .8347, "auc": .8995},
        {"model": "STMem-AD", "features": 28, "window": 96, "rate": .65, "precision": .8011, "recall": .8475, "f1": .8237, "auc": .8932},
    ]
    data = {"schemaVersion": 1, "version": "wind-second-batch-28", "features": features, "times": times.dt.strftime("%Y-%m-%d %H:%M").tolist(), "values": values.tolist(),
            "columns": frame.columns.tolist(), "split": 6131, "labelShape": list(arrays["labels"].shape), "initialPositiveLabels": int(np.count_nonzero(arrays["labels"])),
            "streams": streams, "duplicateWeather": duplicate_weather, "review": review, "rawSample": raw.head(12).fillna("").to_dict("records"), "lineage": lineage.head(12).to_dict("records"),
            "midnight": raw[pd.to_datetime(raw.forecastvaluetime, format="mixed").dt.time.astype(str) == "00:00:00"].head(5).fillna("").to_dict("records"),
            "changes": changes.to_dict("records"), "old": old, "metrics": report_metrics,
            "candidates": [{"start": "2024-12-03 20:50", "end": "2024-12-17 11:15", "rows": 1330}, {"start": "2025-01-24 00:00", "end": "2025-02-28 23:20", "rows": 3506}, {"start": "2025-02-28 23:30", "end": "2025-03-10 17:30", "rows": 1373}, {"start": "2025-04-02 18:10", "end": "2025-07-02 23:45", "rows": 8941}],
            "checks": {"rows": len(frame), "modelColumns": len(FEATURES), "mergedColumns": len(frame.columns), "missingModelCells": int(np.isnan(values).sum()), "duplicateTimes": int(times.duplicated().sum()), "missingGridPoints": 0, "lineageRows": len(lineage)}}
    write_json(output / "research.json", data)
    asset_entries = [{"file": "data/research.json", "bytes": (output / "research.json").stat().st_size, "sha256": digest(output / "research.json")}]
    for path in sorted(assets.glob("*.png")):
        asset_entries.append({"file": "assets/" + path.name, "bytes": path.stat().st_size, "sha256": digest(path), "sourceId": 'old-training-graph' if path.name == 'old7-training.png' else 'report'})
    write_json(output / "provenance.json", {"schemaVersion": 1, "exportedOn": "2026-10-27", "sources": sources, "assets": asset_entries})
    print(f"Exported {len(frame):,} × {len(FEATURES)} input values, {len(sources)} sources, {len(asset_entries)} assets. No research executed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--supplement", type=Path, default=DEFAULT_SUPPLEMENT)
    export(parser.parse_args().supplement)
