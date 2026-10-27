"""Build the lightweight static presentation from retained converter assets."""
from __future__ import annotations
import collections
import hashlib
import io
import json
import pickle
import zipfile
from pathlib import Path
import numpy as np
import openpyxl
from evaluate_results import evaluate_model

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/journey'

class MetadataReader(pickle.Unpickler):
    """Read trusted local training metadata without importing Torch or tensors."""
    def persistent_load(self, pid):
        return ('storage', pid)

    def find_class(self, module, name):
        if (module, name) == ('collections', 'OrderedDict'):
            return collections.OrderedDict
        if module.startswith('torch'):
            return lambda *args: ('tensor', args)
        if module in ('numpy', 'numpy.core.multiarray', 'numpy._core.multiarray') and name in ('dtype', 'scalar', '_reconstruct', 'ndarray'):
            return super().find_class(module, name)
        if (module, name) == ('_codecs', 'encode'):
            return lambda value, encoding: value.encode(encoding)
        raise ValueError(f'Unsupported checkpoint metadata: {module}.{name}')

def checkpoint_history(path):
    with zipfile.ZipFile(path) as archive:
        payload = archive.read(next(n for n in archive.namelist() if n.endswith('data.pkl')))
        checkpoint = MetadataReader(io.BytesIO(payload)).load()
    return [{'epoch': i + 1, 'loss': float(v[0]), 'lr': float(v[1])}
            for i, v in enumerate(checkpoint['accuracy_list'])]

def read_sheet(path, name):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(workbook[name].iter_rows(values_only=True))
    workbook.close()
    return rows

def numeric(value):
    return float(value) if isinstance(value, (int, float)) else np.nan

def serial(array):
    return [[float(v) if np.isfinite(v) else None for v in row] for row in np.asarray(array)]

def segments(labels):
    starts = np.flatnonzero(np.diff(np.r_[0, labels, 0]) == 1)
    ends = np.flatnonzero(np.diff(np.r_[0, labels, 0]) == -1)
    return [{'start': int(a), 'end': int(b)} for a, b in zip(starts, ends)]

def export():
    OUT.mkdir(parents=True, exist_ok=True)
    base = ROOT / 'data/source/dataset'
    raw_rows = read_sheet(base / 'converter.xlsx', 'Sheet8')
    clean_rows = read_sheet(base / 'orgdata/converternew.xlsx', 'Sheet1')
    dictionary = read_sheet(base / 'converter.xlsx', 'Sheet6')
    descriptions = {r[1]: r[0] for r in dictionary}
    raw_headers, headers = raw_rows[0][1:], clean_rows[0][1:]
    raw = np.array([[numeric(v) for v in row[1:]] for row in raw_rows[1:]])
    clean = np.array([row[1:] for row in clean_rows[1:]], float)
    clean_times = [row[0].replace('.', '-').replace(':00:00', ':00') for row in clean_rows[1:]]
    times = [row[0].replace('.', '-')[:16] for row in clean_rows[1:]]
    train = np.load(base / 'prodata/converter_train.npy')
    test = np.load(base / 'prodata/converter_test.npy')
    # Validate exact retained row mapping and the archived segment-wise scaling.
    mapping = [('train', train, clean[1:5594]), ('test', test, clean[5595:])]
    for name, values, original in mapping:
        span = np.ptp(original, axis=0)
        normalized = np.divide(original - original.min(0), span, out=np.zeros_like(original), where=span != 0)
        np.testing.assert_allclose(values, normalized, atol=1e-8, rtol=1e-8, err_msg=name)
    features = []
    for index, key in enumerate(headers):
        english = descriptions.get(key, key)
        label = english.replace('DC CONVERTER NEUTRAL VOLTAGE', '换流器中性点电压').replace('DC CONVERTER MID VOLTAGE', '换流器中间电压').replace('DC CONVERTER HIGH VOLTAGE', '换流器高侧电压')
        if label == english:
            label = ('油温' if 'OIL_TEMP' in key else '阀侧绕组温度' if 'VALVE_TEMP' in key else '网侧绕组温度' if 'LINE_TEMP' in key else '直流电流' if 'IDC' in key else '换流器电压' if 'UD' in key else '交流电压' if 'UL' in key else '监测值')
        features.append({'index': index, 'key': key, 'label': label, 'description': english})
    all_missing = np.isnan(raw).all(0)
    raw_by_time = {str(row[0]): i for i, row in enumerate(raw_rows[1:]) if isinstance(row[0], str) and row[0] != '---'}
    # Find an actual missing value for which the cleaned workbook contains a value.
    example = None
    for c, key in enumerate(headers):
        rc = raw_headers.index(key)
        candidates = np.flatnonzero(np.isnan(raw[:, rc]) & ~np.isnan(raw).all(1))
        for ri in candidates:
            timestamp = raw_rows[ri + 1][0]
            matches = [i for i, row in enumerate(clean_rows[1:]) if row[0] == timestamp]
            if matches and 8 <= matches[0] < len(clean) - 8:
                ci = matches[0]; lo, hi = ci - 8, ci + 9
                before = [numeric(raw_rows[raw_by_time[clean_rows[j + 1][0]] + 1][rc + 1]) if clean_rows[j + 1][0] in raw_by_time else np.nan for j in range(lo, hi)]
                example = {'feature': c, 'times': times[lo:hi], 'before': [float(v) if np.isfinite(v) else None for v in before], 'after': clean[lo:hi, c].tolist(), 'selected': 8}
                break
        if example: break
    assert example is not None
    assets = []
    def binary(name, array):
        array = np.asarray(array, dtype='<f8')
        path = OUT / (name + '.bin'); path.write_bytes(array.tobytes())
        item = {'file': path.name, 'shape': list(array.shape), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        assets.append(item); return item
    results = ROOT / 'data/source/results/converter'
    labels = np.load(results / 'model1/labels.npy').astype(int)
    input_values = np.load(results / 'model1/testRaw.npy')
    matrix = np.load(results / 'model1/matrix.npy')
    models = []
    for model_id, title in [('model1','STAM-AD'),('model2','SMST-AD'),('model3','STMem-AD')]:
        folder = results / model_id
        for filename, expected in [('testRaw.npy', input_values), ('labels.npy', labels), ('matrix.npy', matrix)]:
            np.testing.assert_array_equal(np.load(folder / filename), expected)
        errors, scores = np.load(folder / 'lossPerFeat.npy'), np.load(folder / 'lossFinal.npy')
        np.testing.assert_allclose(errors.mean(1), scores, rtol=0, atol=0)
        metrics = evaluate_model(model_id)
        models.append({'id': model_id, 'name': title, 'threshold': metrics['threshold'], 'thresholdSource': metrics['threshold_source'],
            'metrics': metrics, 'scores': scores.tolist(), 'history': checkpoint_history(ROOT / f'data/models/converter/{model_id}/model.ckpt'),
            'recon': binary(model_id + '-recon', np.load(folder / 'recon.npy')), 'errors': binary(model_id + '-errors', errors)})
    selected = [1, 2, 3, 4, 16, 24]
    sample_indices = [0, 1, 2, 3, 4, 5]
    normalization = []
    for c in selected:
        normalization.append({'feature': c, 'trainMin': float(clean[1:5594,c].min()), 'trainMax': float(clean[1:5594,c].max()),
            'testMin': float(clean[5595:,c].min()), 'testMax': float(clean[5595:,c].max()),
            'raw': clean[5300:5364,c].tolist(), 'normalized': train[5299:5363,c].tolist()})
    data = {'schemaVersion': 2, 'dataset': '第一批换流设备', 'window': 64, 'features': features, 'times': times[5595:],
        'labels': labels.tolist(), 'segments': segments(labels), 'models': models,
        'input': binary('input', input_values), 'cleanTest': binary('clean-test', test), 'labelMatrix': binary('labels', matrix),
        'summary': {'rawRows': len(raw), 'rawFeatures': len(raw_headers), 'emptyFeatures': int(all_missing.sum()),
            'emptyRows': int(np.isnan(raw).all(1).sum()), 'cleanRows': len(clean), 'features': len(headers),
            'trainRows': len(train), 'testRows': len(test), 'anomalousRows': int(labels.sum()),
            'trainStart': times[1], 'trainEnd': times[5593], 'testStart': times[5595], 'testEnd': times[-1],
            'omittedTimes': [times[0], times[5594]], 'cleanStart': times[0], 'cleanEnd': times[-1]},
        'removedFeatures': [str(k) for k, empty in zip(raw_headers, all_missing) if empty],
        'missingExample': example, 'normalization': normalization, 'sampleFeatures': selected,
        'sampleRows': [{'time': times[i], 'values': clean[i,selected].tolist()} for i in sample_indices],
        'rawSampleRows': [{'time': str(raw_rows[i + 1][0]).replace('.', '-')[:16],
            'values': serial(raw[i:i+1, [raw_headers.index(headers[c]) for c in selected]])[0]} for i in sample_indices],
        'trainingSample': train[5300:5428][:,selected].tolist(),
        'provenance': {'raw': 'data/source/dataset/converter.xlsx · Sheet8', 'clean': 'data/source/dataset/orgdata/converternew.xlsx · Sheet1',
            'arrays': 'data/source/dataset/prodata', 'results': 'data/source/results/converter',
            'normalization': '归档数组与两段分别执行 Min–Max 的结果逐值一致（容差 1e-8）。报告描述采用训练段统计量。',
            'mapping': '训练对应整理表数据索引 1…5593；测试对应 5595…7991。索引从 0 开始。映射经全部数值比对。',
            'reconstruction': '重建曲线读取 recon.npy；分数读取逐窗口误差合并后的 lossPerFeat.npy，再对 125 个测点取平均。',
            'window': '展示窗口为已保存序列中的连续 64 个时刻。重建曲线为重叠窗口合并结果。',
            'training': '训练曲线提取各自 model.ckpt 的 accuracy_list；模型三归档入口保留异常增强调用。',
            'threshold': '采用各自归档绘图脚本阈值。模型三阈值由测试标签上的点调整 F1 扫描选择。',
            'cleaning': '原始表中展示的缺失值，在整理表中对应数值为0。报告记载加权滑动平均填补与平滑；平滑页展示方法步骤，处理参数与逐步输出待服务器资料补齐。'},
        'assets': assets}
    path = OUT / 'manifest.json'
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'Exported {len(assets)} arrays, {len(features)} features, {len(labels)} test records; {sum(a["bytes"] for a in assets)/1024**2:.1f} MiB')

if __name__ == '__main__':
    export()
