"""Check every shipped view against its retained source, without changing files."""
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data/journey'
REFERENCE = ROOT / 'data/reference'


def read(base, asset, dtype='<f8'):
    raw = (base / asset['file']).read_bytes()
    assert len(raw) == asset['bytes']
    assert hashlib.sha256(raw).hexdigest() == asset['sha256'], asset['file']
    return np.frombuffer(raw, dtype=dtype).reshape(asset['shape'])


def verify():
    source = json.loads((REFERENCE / 'manifest.json').read_text(encoding='utf-8'))
    runtime = json.loads((PUBLIC / 'manifest.json').read_text(encoding='utf-8'))
    for key in ('features', 'times', 'labels', 'summary', 'removedFeatures', 'resultVersion'):
        assert runtime[key] == source[key], key
    arrays = {a['file']: read(REFERENCE, a) for a in [*source['assets'], *source['datasets'].values()]}
    raw = arrays[source['input']['file']]
    labels = arrays[source['labelMatrix']['file']]
    read(PUBLIC, runtime['labelMatrix'])
    expected = {'manifest.json', runtime['labelMatrix']['file'], 'evaluation.json'}
    for asset in [source['input'], source['datasets']['train'], *(m['recon'] for m in source['models'])]:
        values = arrays[asset['file']]
        mean = np.zeros(len(values))
        for feature in range(values.shape[1]):
            name = f'curves-v1/{asset["sha256"]}/{feature}.bin'
            np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8'), values[:, feature])
            mean += values[:, feature]
            expected.add(name)
        if asset['sha256'] != source['datasets']['train']['sha256']:
            name = f'curves-v1/{asset["sha256"]}/mean.bin'
            np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8'), mean / values.shape[1])
            expected.add(name)
    for start in range(0, len(raw), 128):
        name = f'input-rows-v1/{source["input"]["sha256"]}/{start}.bin'
        np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8').reshape(-1, 125), raw[start:start + 128])
        expected.add(name)
    index = json.loads((PUBLIC / 'calculation-v1/manifest.json').read_text())
    expected.add('calculation-v1/manifest.json')
    for original, model in zip(source['models'], runtime['models']):
        for key in ('id', 'scores', 'history', 'threshold', 'windowThreshold', 'metrics', 'run'):
            assert model[key] == original[key], (model['id'], key)
        errors = arrays[original['errors']['file']]
        np.testing.assert_array_equal(errors.argmax(1), model['focusFeatures'])
        scores = read(PUBLIC, index['models'][model['id']])
        expected.add(index['models'][model['id']]['file'])
        for chunk in model['windows']['chunks']:
            payload = (PUBLIC / chunk['file']).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == chunk['sha256']
            predictions = np.frombuffer(payload, '<f4').reshape(-1, 64, 125)
            for i, prediction in enumerate(predictions):
                start = chunk['start'] + i
                np.testing.assert_array_equal(scores[start], ((raw[start:start + 64] - prediction.astype(float)) ** 2).mean(1))
            expected.add(chunk['file'])
        for example in model['examples']:
            point = example['index']
            predicted = scores[example['start'], point - example['start']] > model['windowThreshold']
            code = ('tp' if predicted else 'fn') if labels[point].any() else ('fp' if predicted else 'tn')
            assert code == example['code'], (model['id'], example)
    actual = {p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob('*') if p.is_file() and 'anomaly-cases-v1' not in p.parts}
    assert actual == expected, {'extra': sorted(actual - expected), 'missing': sorted(expected - actual)}
    print(f'PASS {len(expected)} runtime files: exact curves, row chunks, all window scores, focus indexes and examples')


if __name__ == '__main__':
    verify()
