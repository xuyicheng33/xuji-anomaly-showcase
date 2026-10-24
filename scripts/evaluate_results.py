"""Read saved research arrays and evaluate them with their original scripts."""

import ast
import json
from pathlib import Path

import numpy as np
from scipy.stats import rankdata

ROOT = Path(__file__).resolve().parents[1]


def counts(labels, prediction):
    y = np.asarray(labels, dtype=bool)
    p = np.asarray(prediction, dtype=bool)
    tp = int((y & p).sum())
    fp = int((~y & p).sum())
    fn = int((y & ~p).sum())
    tn = int((~y & ~p).sum())
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    }


def evaluate_archive(script, scores, labels):
    def confusion_matrix(y, prediction):
        values = counts(y, prediction)
        return np.array([[values["tn"], values["fp"]], [values["fn"], values["tp"]]])

    namespace = {"np": np, "confusion_matrix": confusion_matrix}
    tree = ast.parse(script.read_text(encoding="utf-8-sig"))
    names = {"point_adjust", "pa_f1", "find_best_threshold_pa"}
    functions = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in names
    ]
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(script), "exec"), namespace)
    constants = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in {"FIXED_THRESHOLD", "THRESHOLD"}:
                    try:
                        constants[target.id] = ast.literal_eval(node.value)
                    except ValueError:
                        pass
    if "FIXED_THRESHOLD" in constants:
        threshold = constants["FIXED_THRESHOLD"]
        if threshold is None:
            threshold, _ = namespace["find_best_threshold_pa"](scores, labels)
            source = "原绘图脚本的点调整 F1 阈值扫描"
        else:
            source = "原绘图脚本的固定阈值"
    elif "THRESHOLD" in constants:
        threshold = constants["THRESHOLD"]
        source = "原绘图脚本的固定阈值"
    else:
        raise ValueError(f"原脚本没有提供阈值：{script}")
    prediction = namespace["point_adjust"](scores, labels, threshold).astype(np.uint8)
    return float(threshold), prediction, source


def evaluate_model(model_id):
    folder = ROOT / "data/source/results/converter" / model_id
    scores = np.load(folder / "lossFinal.npy").reshape(-1)
    labels = np.load(folder / "labels.npy").reshape(-1)
    threshold, prediction, source = evaluate_archive(folder / "viz_best.py", scores, labels)
    positive = labels > 0
    n1 = int(positive.sum())
    n0 = len(labels) - n1
    auc = float(
        (rankdata(scores)[positive].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)
    ) if n1 and n0 else None
    return {
        "dataset": "converter",
        "model": model_id,
        "test_rows": len(labels),
        "anomaly_rows": n1,
        "threshold": threshold,
        "threshold_source": source,
        "point_wise": counts(labels, scores > threshold),
        "point_adjusted": counts(labels, prediction),
        "continuous_score_auc": auc,
    }


if __name__ == "__main__":
    print(json.dumps(
        [evaluate_model(model_id) for model_id in ("model1", "model2", "model3")],
        ensure_ascii=False,
        indent=2,
    ))
