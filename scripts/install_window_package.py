"""Publish one retrospective evaluation version over the retained window outputs."""
import hashlib
import json
from pathlib import Path
import numpy as np
from data_geometry import geometry
import shutil
from evaluation_policy import counts, point_adjust
from evaluation_policy import POLICY, RESULT_VERSION, select_threshold

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/reference'
PUBLIC = ROOT / 'public/data/journey'


def install():
    path = OUT / 'manifest.json'
    data = json.loads(path.read_text('utf8'))
    _, features, window = geometry(data)
    y = np.asarray(data['labels'])
    raw = np.fromfile(OUT / data['input']['file'], dtype='<f8').reshape(-1, features)
    label_matrix = np.fromfile(OUT / data['labelMatrix']['file'], dtype='<f8').reshape(-1, features)
    models, evaluations = [], []
    for previous in data['models']:
        if previous['id'] not in ('model1', 'model2'):
            continue
        fresh = json.loads((OUT / f'windows-v1/{previous["id"]}/source-manifest.json').read_text('utf8'))
        windows = []
        for chunk in fresh['chunks']:
            payload = (OUT / chunk['file']).read_bytes()
            if hashlib.sha256(payload).hexdigest() != chunk['sha256']:
                raise ValueError(f'Window checksum differs: {chunk["file"]}')
            target = PUBLIC / chunk['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(OUT / chunk['file'], target)
            predictions = np.frombuffer(payload, dtype='<f4').reshape(chunk['count'], window, features)
            for j, prediction in enumerate(predictions):
                start = chunk['start'] + j
                windows.append(((raw[start:start + window] - prediction.astype(float)) ** 2).mean(1))
        window_scores = np.asarray(windows)
        window_labels = np.asarray([y[i:i + window] for i in range(len(window_scores))])
        scores = np.asarray(fresh['scores'])
        sequence = select_threshold(scores, y)
        window_evaluation = select_threshold(window_scores, window_labels)
        threshold = sequence['value']
        m = {k: previous[k] for k in ('id', 'name', 'history')}
        m.update({k: fresh[k] for k in ('scores', 'recon', 'errors', 'coverage')})
        m.update({
            'threshold': threshold, 'windowThreshold': window_evaluation['value'],
            'thresholdSource': '在本版测试结果上遍历阈值，选择区间点调整F1最高的值；并列时依次比较逐点F1与阈值。',
            'metrics': {
                'point_wise': counts(y, scores > threshold),
                'point_adjusted': counts(y, point_adjust(y, scores > threshold)),
                'continuous_score_auc': fresh['metrics']['continuous_score_auc'],
            },
            'evaluation': {'policy': POLICY['id'], 'sequence': sequence, 'window': window_evaluation},
            'windows': {'chunks': fresh['chunks'], 'count': fresh['windowCount'], 'dtype': 'float32',
                        'maskDirectory': 'windows-v1/masks', 'maskPolicy': fresh['maskPolicy']},
            'run': RESULT_VERSION, 'inferenceRun': fresh['run'],
            'provenance': {'sources': fresh['sources'], 'probe': fresh['probe'], 'inputPolicy': fresh['inputPolicy']},
            'examples': [],
        })
        errs = np.fromfile(OUT / m['errors']['file'], dtype='<f8').reshape(-1, features)
        for code in ('tp', 'fn', 'fp', 'tn'):
            indexes = np.flatnonzero((y.astype(bool) == (code in ('tp', 'fn'))) &
                                     ((scores > threshold) == (code in ('tp', 'fp'))))
            candidates = indexes[(indexes >= window) & (indexes < len(y) - window)]
            if not len(candidates): candidates = indexes
            if not len(candidates): continue
            index = int(candidates[0])
            feature = int(np.argmax(label_matrix[index] * errs[index])) if code in ('tp', 'fn') else int(np.argmax(errs[index]))
            m['examples'].append({'code': code, 'index': index, 'start': max(0, min(len(y) - window, index - 24)), 'feature': feature})
        models.append(m)
        evaluations.append({'id': m['id'], 'sequence': sequence, 'window': window_evaluation})
    data['models'] = models
    data['assets'] = [data['input'], data['cleanTest'], data['labelMatrix'],
                      *[a for m in models for a in (m['recon'], m['errors'])]]
    data['resultVersion'] = RESULT_VERSION
    data['evaluation'] = {**POLICY, 'date': '2026-10-27', 'inferenceVersion': 'windows-v1-20261027'}
    data['provenance'].update({
        'window': '每模型2334个完整64点窗口，步长1，保存各窗口独立重建结果。',
        'reconstruction': '按源时刻分别平均覆盖窗口的重建值和平方误差，再对125个测点平均误差。',
        'threshold': '事后回看评估：在本版结果上选择区间点调整F1最高的阈值，同时报告逐点F1。独立窗口与合并序列分别按同一规则选取。',
        'training': 'STAM-AD训练15轮，SMST-AD训练20轮，使用各自保存的检查点。',
    })
    data['provenance'].pop('alignment', None)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf8')
    (PUBLIC / 'evaluation.json').write_text(json.dumps({'version': RESULT_VERSION, 'policy': POLICY, 'models': evaluations},
                                                   ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps([{'model': m['name'], 'threshold': m['threshold'], 'windowThreshold': m['windowThreshold'],
                       'metrics': m['metrics']} for m in models], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    install()
