"""Check every shipped view against its retained source, without changing files."""
from dataset_paths import selected_paths, dataset_info
from pathlib import Path
import hashlib
import json
import numpy as np
from data_geometry import geometry
from array_assets import read_array as read

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/data/journey'
REFERENCE = ROOT / 'data/reference'


def verify():
    source = json.loads((REFERENCE / 'manifest.json').read_text(encoding='utf-8'))
    runtime = json.loads((PUBLIC / 'manifest.json').read_text(encoding='utf-8'))
    _, features, window = geometry(source)
    assert runtime['dataset'] == dataset_info(source)
    for key in ('features', 'times', 'labels', 'summary', 'removedFeatures', 'resultVersion'):
        assert runtime[key] == source[key], key
    arrays = {a['file']: read(REFERENCE, a) for a in [*source['assets'], *source['datasets'].values()]}
    raw = arrays[source['input']['file']]
    labels = arrays[source['labelMatrix']['file']]
    expected = {'manifest.json', 'evaluation.json'}
    for asset in [source['input'], source['datasets']['train'], source['labelMatrix'], *(m['recon'] for m in source['models'])]:
        values = arrays[asset['file']]
        published_asset = next(a for a in [runtime['input'], runtime['datasets']['train'], runtime['labelMatrix'],
                                           *(m['recon'] for m in runtime['models'])] if a['file'] == asset['file'])
        mean = np.zeros(len(values))
        for feature in range(values.shape[1]):
            name = f'curves-v1/{asset["sha256"]}/{feature}.bin'
            np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8'), values[:, feature])
            assert hashlib.sha256((PUBLIC / name).read_bytes()).hexdigest() == published_asset['curves'][str(feature)], name
            mean += values[:, feature]
            expected.add(name)
        if asset['sha256'] not in (source['datasets']['train']['sha256'], source['labelMatrix']['sha256']):
            name = f'curves-v1/{asset["sha256"]}/mean.bin'
            np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8'), mean / values.shape[1])
            assert hashlib.sha256((PUBLIC / name).read_bytes()).hexdigest() == published_asset['curves']['mean'], name
            expected.add(name)
    for start in range(0, len(raw), runtime['inputChunkRows']):
        name = f'input-rows-v2/{source["input"]["sha256"]}/{start}.bin'
        np.testing.assert_array_equal(np.fromfile(PUBLIC / name, dtype='<f8').reshape(-1, features), raw[start:start + runtime['inputChunkRows']])
        assert hashlib.sha256((PUBLIC / name).read_bytes()).hexdigest() == runtime['inputRowHashes'][start // runtime['inputChunkRows']], name
        expected.add(name)
    index = json.loads((PUBLIC / 'calculation-v1/manifest.json').read_text())
    expected.add('calculation-v1/manifest.json')
    for original, model in zip(source['models'], runtime['models']):
        for key in ('id', 'scores', 'history', 'threshold', 'windowThreshold', 'metrics', 'run'):
            assert model[key] == original[key], (model['id'], key)
        errors = arrays[original['errors']['file']]
        for chunk in model['contributions']['chunks']:
            payload = (PUBLIC / chunk['file']).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == chunk['sha256']
            values = np.frombuffer(payload, '<f8').reshape(chunk['count'], features)
            np.testing.assert_array_equal(values, errors[chunk['start']:chunk['start'] + chunk['count']])
            np.testing.assert_allclose(values.mean(1), model['scores'][chunk['start']:chunk['start'] + chunk['count']], rtol=0, atol=1e-15)
            expected.add(chunk['file'])
        np.testing.assert_array_equal(errors.argmax(1), model['focusFeatures'])
        scores = read(PUBLIC, index['models'][model['id']])
        expected.add(index['models'][model['id']]['file'])
        for chunk in model['windows']['chunks']:
            payload = (PUBLIC / chunk['file']).read_bytes()
            assert hashlib.sha256(payload).hexdigest() == chunk['sha256']
            assert payload == (REFERENCE / chunk['file']).read_bytes()
            predictions = np.frombuffer(payload, '<f4').reshape(-1, window, features)
            hashes = read(PUBLIC, chunk['integrity'], 'uint8')
            expected_hashes = [hashlib.sha256(prediction.tobytes()).digest() for prediction in predictions]
            for point in range(chunk['count'] + window - 1):
                digest = hashlib.sha256()
                for start in range(max(0, point - window + 1), min(chunk['count'], point + 1)):
                    digest.update(predictions[start, point - start].tobytes())
                expected_hashes.append(digest.digest())
            assert hashes.tobytes() == b''.join(expected_hashes), chunk['integrity']['file']
            expected.add(chunk['integrity']['file'])
            for i, prediction in enumerate(predictions):
                start = chunk['start'] + i
                np.testing.assert_array_equal(scores[start], ((raw[start:start + window] - prediction.astype(float)) ** 2).mean(1))
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
    REFERENCE, PUBLIC = selected_paths()
    verify()
