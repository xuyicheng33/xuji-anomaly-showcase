"""Evaluate archived results using the server's own visualization functions."""
import ast
import numpy as np
from .analytics import counts


def evaluate_archive(script, scores, labels):
    namespace = {
        "np": np,
        "confusion_matrix": lambda y, p: np.array([
            [counts(y, p)["tn"], counts(y, p)["fp"]],
            [counts(y, p)["fn"], counts(y, p)["tp"]],
        ]),
    }
    tree = ast.parse(script.read_text(encoding="utf-8-sig"))
    names = {"point_adjust", "pa_f1", "find_best_threshold_pa"}
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
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
        value = constants["FIXED_THRESHOLD"]
        if value is None:
            threshold, _ = namespace["find_best_threshold_pa"](scores, labels)
            source = "服务器绘图脚本：点调整 F1 阈值扫描"
        else:
            threshold = float(value)
            source = "服务器绘图脚本：保存的固定阈值"
    elif "THRESHOLD" in constants:
        threshold = float(constants["THRESHOLD"])
        source = "服务器绘图脚本：保存的固定阈值"
    else:
        raise ValueError("服务器脚本未提供阈值，停止导入")
    prediction = namespace["point_adjust"](scores, labels, threshold).astype(np.uint8)
    return float(threshold), prediction, source
