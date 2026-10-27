"""Export converter dataset and model prediction data for showcase dashboard."""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
EXCEL_PATH = ROOT / "data/source/dataset/converter.xlsx"
PRODATA_DIR = ROOT / "data/source/dataset/prodata"
RESULTS_DIR = ROOT / "data/source/results/converter"
OUT_FILE = ROOT / "public/data/converter_showcase.json"


def parse_val(v):
    if v is None or v == "---" or v == "":
        return np.nan
    try:
        return float(v)
    except Exception:
        return np.nan


def get_feature_group(col_name: str) -> tuple[str, str, str]:
    """Returns (group_name, label_zh, unit)"""
    if "UDN" in col_name:
        return "直流电压系统", f"中性点直流电压 ({col_name})", "kV"
    if "UDM" in col_name:
        return "直流电压系统", f"中压侧直流电压 ({col_name})", "kV"
    if "UDH" in col_name:
        return "直流电压系统", f"高压侧直流电压 ({col_name})", "kV"
    if "UD_CONV" in col_name:
        return "直流电压系统", f"换流阀组直流电压 ({col_name})", "kV"
    if "IDCH" in col_name:
        return "直流电流系统", f"高压侧直流电流 ({col_name})", "A"
    if "IDCN" in col_name:
        return "直流电流系统", f"中性点直流电流 ({col_name})", "A"
    if "UL" in col_name or "UL1" in col_name:
        return "交流母线系统", f"交流母线线电压 ({col_name})", "kV"
    if "IDL" in col_name:
        return "交流母线系统", f"交流相电流 ({col_name})", "A"
    if "OIL_TEMP" in col_name:
        return "换流变温度", f"顶层油温 ({col_name})", "℃"
    if "VALVE_TEMP" in col_name:
        return "换流变温度", f"阀侧绕组温度 ({col_name})", "℃"
    if "LINE_TEMP" in col_name:
        return "换流变温度", f"网侧绕组温度 ({col_name})", "℃"
    return "辅机与监测", f"监测测点 ({col_name})", "单位"


def main():
    print("[1/5] Reading Excel headers and time index...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
    sheet = wb.active
    rows_iter = sheet.iter_rows(values_only=True)
    headers = list(next(rows_iter))
    
    times = []
    sample_rows = []
    row_count = 0
    for r in rows_iter:
        times.append(str(r[0]))
        if row_count < 5593:
            sample_rows.append([parse_val(x) for x in r[1:]])
        row_count += 1
    
    sample_mat = np.array(sample_rows, dtype=float)
    nan_cols = np.isnan(sample_mat).all(axis=0)
    selected_col_indices = [c for c in range(sample_mat.shape[1]) if not nan_cols[c]]
    assert len(selected_col_indices) == 125, f"Expected 125 cols, got {len(selected_col_indices)}"
    
    test_times = times[5593:5593 + 2397]
    assert len(test_times) == 2397, f"Expected 2397 test times, got {len(test_times)}"
    
    # 构造 features
    features = []
    for rank, orig_idx in enumerate(selected_col_indices):
        raw_name = headers[1 + orig_idx]
        grp, lbl, unit = get_feature_group(raw_name)
        features.append({
            "index": rank,
            "key": raw_name,
            "label": lbl,
            "group": grp,
            "unit": unit
        })

    print("[2/5] Loading model outputs and ground truth...")
    labels = np.load(RESULTS_DIR / "model1/labels.npy").astype(int).tolist()
    
    # 提取连续异常区间
    anomaly_segments = []
    in_seg = False
    seg_start = 0
    for i, v in enumerate(labels):
        if v == 1 and not in_seg:
            in_seg = True
            seg_start = i
        elif v == 0 and in_seg:
            in_seg = False
            anomaly_segments.append({
                "start": seg_start,
                "end": i - 1,
                "length": i - seg_start,
                "startTime": test_times[seg_start],
                "endTime": test_times[i - 1]
            })
    if in_seg:
        anomaly_segments.append({
            "start": seg_start,
            "end": len(labels) - 1,
            "length": len(labels) - seg_start,
            "startTime": test_times[seg_start],
            "endTime": test_times[-1]
        })

    # 挑选代表性测点进行波形回放 (涵盖各个系统)
    core_feature_indices = [0, 1, 2, 3, 4, 6, 16, 17, 24, 25, 26, 27]
    # 确保这些索引对应的特征存在
    core_feature_meta = [features[i] for i in core_feature_indices]
    
    raw_test = np.load(RESULTS_DIR / "model1/testRaw.npy")
    test_raw_dict = {str(idx): np.round(raw_test[:, idx], 4).tolist() for idx in core_feature_indices}

    print("[3/5] Processing models: STAM-AD, SMST-AD, STMem-AD...")
    models_data = {}
    model_configs = [
        ("model1", "STAM-AD", "双分支自适应掩码异常增强模型", 0.03153185, 0.8978, 0.8996, 0.8959, 0.898, 439, 49, 51, 1858),
        ("model2", "SMST-AD", "多尺度时空依赖与关系建模模型", 0.03273000, 0.9061, 0.9165, 0.8959, 0.902, 439, 40, 51, 1867),
        ("model3", "STMem-AD", "时空记忆网络与正常模式重构模型", 0.04931000, 0.7269, 0.8131, 0.6571, 0.841, 322, 74, 168, 1833),
    ]

    for dir_name, model_key, full_name, thr, f1, p, r, auc, tp, fp, fn, tn in model_configs:
        m_dir = RESULTS_DIR / dir_name
        scores = np.load(m_dir / "lossFinal.npy").reshape(-1)
        recon = np.load(m_dir / "recon.npy")
        
        recons_dict = {str(idx): np.round(recon[:, idx], 4).tolist() for idx in core_feature_indices}
        
        models_data[model_key] = {
            "key": model_key,
            "name": model_key,
            "title": full_name,
            "threshold": float(thr),
            "scores": np.round(scores, 5).tolist(),
            "recons": recons_dict,
            "metrics": {
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "tn": tn,
                "precision": p,
                "recall": r,
                "f1": f1,
                "auc": auc
            }
        }

    print("[4/5] Synthesizing 8 anomaly studio scenarios...")
    # 4类异常 × 2种注入方式 = 8种组合
    # 从真实数据中截取长度为 48 的代表性波形片段 (以第 4 号特征 IDCH 高压电流与第 25 号特征阀温为例)
    base_seg_normal = np.round(raw_test[300:348, 4], 4).tolist()
    
    # 构造 8 种形态
    def build_studio_item(combo_id, name, anom_type, inject_mode, desc, physics, formula, apply_fn):
        clean = np.array(base_seg_normal, dtype=float).copy()
        anom, mask = apply_fn(clean)
        return {
            "id": combo_id,
            "name": name,
            "anomalyType": anom_type,
            "injectionMode": inject_mode,
            "description": desc,
            "physicsMeaning": physics,
            "formula": formula,
            "cleanWave": [round(float(x), 4) for x in clean],
            "anomWave": [round(float(x), 4) for x in anom],
            "labels": [int(x) for x in mask]
        }

    def fn_soft_train(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        # 软替换加权: x_tilde = 0.6 * x + 0.4 * x_other (反转相位)
        idx_s, idx_e = 16, 32
        donor = np.roll(arr, 12)
        res[idx_s:idx_e] = 0.55 * arr[idx_s:idx_e] + 0.45 * donor[idx_s:idx_e]
        mask[idx_s:idx_e] = 1
        return res, mask

    def fn_soft_test(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        idx_s, idx_e = 12, 34
        donor = np.sin(np.linspace(0, 3 * np.pi, idx_e - idx_s)) * 0.3 + np.mean(arr)
        res[idx_s:idx_e] = 0.4 * arr[idx_s:idx_e] + 0.6 * donor
        mask[idx_s:idx_e] = 1
        return res, mask

    def fn_uniform_train(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        idx_s, idx_e = 18, 30
        res[idx_s:idx_e] = np.mean(arr[idx_s:idx_e]) * 0.85
        mask[idx_s:idx_e] = 1
        return res, mask

    def fn_uniform_test(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        idx_s, idx_e = 14, 32
        res[idx_s:idx_e] = np.min(arr) + 0.05
        mask[idx_s:idx_e] = 1
        return res, mask

    def fn_peak_train(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        res[22] += 0.35
        mask[20:25] = 1
        return res, mask

    def fn_peak_test(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        res[20] += 0.42
        res[26] -= 0.38
        mask[18:28] = 1
        return res, mask

    def fn_length_train(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        idx_s, idx_e = 15, 33
        # 重采样压缩
        sub = arr[idx_s:idx_e]
        resampled = np.interp(np.linspace(0, len(sub), len(sub)), np.linspace(0, len(sub), len(sub) * 2)[:len(sub)], sub)
        res[idx_s:idx_e] = resampled
        mask[idx_s:idx_e] = 1
        return res, mask

    def fn_length_test(arr):
        res = arr.copy()
        mask = np.zeros(len(arr), dtype=int)
        idx_s, idx_e = 12, 36
        sub = arr[idx_s:idx_e]
        resampled = np.interp(np.linspace(0, len(sub), len(sub)), np.linspace(0, len(sub) / 2, len(sub)), sub)
        res[idx_s:idx_e] = resampled
        mask[idx_s:idx_e] = 1
        return res, mask

    anomaly_studio = [
        build_studio_item("soft_train", "软替换 · 训练动态", "软替换", "训练阶段动态注入", "在训练 epoch 随机选取序列块与参考段加权混合，促使模型学习解耦本征特征", "模拟换流变温升漂移与局部过热耦合，波形出现渐进性相移与形态畸变", "x̃ = (1 - α)x + α x'", fn_soft_train),
        build_studio_item("soft_test", "软替换 · 测试固定", "软替换", "测试阶段固定基准", "评测集固化固定种子软注入段，评测模型对非线性微弱畸变的召回灵敏度", "换流阀触发角轻微失步引起的连续周期纹波畸变", "x̃ = (1 - α)x + α x_ref", fn_soft_test),
        build_studio_item("uniform_train", "均匀替换 · 训练动态", "均匀替换", "训练阶段动态注入", "随机选取连续区间强制赋为恒定常数，提升自适应掩码补齐能力", "模拟工业采样通道信号中断、A/D 转换芯片死锁保持（Stuck-at-fault）", "x̃[t₀:t₁] = k", fn_uniform_train),
        build_studio_item("uniform_test", "均匀替换 · 测试固定", "均匀替换", "测试阶段固定基准", "评测集固化固定常数段，验证模型对恒定信号边界与重建误差的激增响应", "传感器接线断路或变送器零点漂移闭锁", "x̃[t₀:t₁] = c_const", fn_uniform_test),
        build_studio_item("peak_train", "峰值噪声 · 训练动态", "峰值噪声", "训练阶段动态注入", "向单点突加尖峰脉冲，标签按窗口 patch 邻域外扩覆盖", "高压直流换流阀厅局部放电脉冲或雷电暂态过电压冲击", "x̃[t] = x[t] + δ", fn_peak_train),
        build_studio_item("peak_test", "峰值噪声 · 测试固定", "峰值噪声", "测试阶段固定基准", "测试集中固化双极性脉冲扰动，精准检验模型对瞬态尖峰的快速报警时延", "阀控系统保护误触发或电磁脉冲瞬态毛刺", "x̃[t] = x[t] ± ΔP", fn_peak_test),
        build_studio_item("length_train", "长度调整 · 训练动态", "长度调整", "训练阶段动态注入", "对时序片段进行时间维重采样拉伸或压缩，改变局部频率", "模拟风机转速波动或冷却水泵工况变频导致的周期缩短或延展", "x̃(t) = x(γ · t)", fn_length_train),
        build_studio_item("length_test", "长度调整 · 测试固定", "长度调整", "测试阶段固定基准", "固定测试频率缩放段，检验多尺度时空分支对变化速率畸变的敏感性", "换流变重载突加温升速率异常加快（温升时间常数改变）", "x̃(t) = Interp(x, γ)", fn_length_test),
    ]

    print("[5/5] Assembling final showcase payload...")
    payload = {
        "datasetMeta": {
            "name": "许继电气特高压换流设备时序监测数据集",
            "device": "2022年换流站换流变及换流阀组",
            "totalSamples": 7990,
            "trainSamples": 5593,
            "testSamples": 2397,
            "featuresCount": 125,
            "timeRange": "2022-08-22 01:00 至 2022-11-29 21:00",
            "splitRatio": "7:3 按时间顺序划分",
            "normalTraining": True,
            "totalAnomalousPoints": sum(labels),
            "anomalyRatio": round(sum(labels) / len(labels), 4),
            "anomalySegmentsCount": len(anomaly_segments)
        },
        "features": features,
        "coreFeatures": core_feature_meta,
        "times": test_times,
        "labels": labels,
        "anomalySegments": anomaly_segments,
        "testRaw": test_raw_dict,
        "models": models_data,
        "anomalyStudio": anomaly_studio
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = OUT_FILE.stat().st_size / (1024 * 1024)
    print(f"SUCCESS: Exported {OUT_FILE.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
