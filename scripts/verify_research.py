"""Verify retained source assets and print dataset shapes without writing files."""

import ast
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def array_header(path):
    with path.open("rb") as handle:
        magic = handle.read(8)
        if magic[:6] != b"\x93NUMPY":
            raise ValueError(f"不是 NumPy 文件：{path}")
        version = magic[6]
        if version not in (1, 2, 3):
            raise ValueError(f"不支持的 NumPy 版本：{version}")
        length_bytes = 2 if version == 1 else 4
        length = struct.unpack("<H" if version == 1 else "<I", handle.read(length_bytes))[0]
        return ast.literal_eval(handle.read(length).decode("utf-8" if version == 3 else "latin1"))


def verify_assets():
    records = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8-sig"))
    expected = set()
    total_bytes = 0
    for record in records:
        path = (ROOT / record["local"]).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError(f"清单路径超出工程：{record['local']}")
        if record["local"] in expected:
            raise ValueError(f"清单路径重复：{record['local']}")
        expected.add(record["local"])
        if path.stat().st_size != record["bytes"]:
            raise ValueError(f"文件大小变化：{record['local']}")
        if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError(f"文件内容变化：{record['local']}")
        total_bytes += record["bytes"]
    actual = {
        path.relative_to(ROOT).as_posix()
        for folder in ("data/source", "data/models")
        for path in (ROOT / folder).rglob("*") if path.is_file()
    }
    # The formal clean test baseline was verified and added after the initial sync.
    baseline_dir = ROOT / 'data/source/dataset/experiment-v1'
    source = json.loads((baseline_dir / 'source.json').read_text(encoding='utf8'))
    baseline = baseline_dir / 'converter_test_clean.npy'
    if hashlib.sha256(baseline.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('正式实验清洁测试底稿校验失败')
    expected.update(p.relative_to(ROOT).as_posix() for p in (baseline, baseline_dir / 'source.json'))
    extra = actual - expected
    if extra:
        raise ValueError(f"核心目录存在清单外文件：{sorted(extra)}")
    print(f"核心材料校验通过：{len(records)} 个归档文件及正式测试底稿，{total_bytes / 1024 ** 2:.1f} MiB")
    for dataset, paths in {
        "换流设备 converter": ("data/source/dataset/prodata/converter_train.npy",
                              "data/source/dataset/prodata/converter_test.npy"),
        "风电旧版 xuji": ("data/source/data/xuji/train.npy", "data/source/data/xuji/test.npy"),
    }.items():
        train, test = [array_header(ROOT / path)["shape"] for path in paths]
        print(f"{dataset}：训练 {train}，测试 {test}")


if __name__ == "__main__":
    verify_assets()
