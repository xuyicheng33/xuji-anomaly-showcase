"""Publish only the exact data and indexes used by the browser."""
from pathlib import Path
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'data/reference'
PUBLIC = ROOT / 'public/data/journey'


def runtime_manifest(source):
    result = {key: source[key] for key in (
        'schemaVersion', 'resultVersion', 'window', 'features', 'times', 'labels',
        'input', 'labelMatrix', 'summary', 'removedFeatures')}
    result['datasets'] = {'train': source['datasets']['train']}
    result['models'] = []
    labels = np.asarray(source['labels'], dtype=bool)
    raw = np.fromfile(REFERENCE / source['input']['file'], dtype='<f8').reshape(-1, 125)
    for model in source['models']:
        current = {key: model[key] for key in (
            'id', 'name', 'threshold', 'windowThreshold', 'scores', 'history', 'recon', 'metrics', 'run')}
        current['windows'] = {key: model['windows'][key] for key in ('chunks', 'count')}
        errors = np.fromfile(REFERENCE / model['errors']['file'], dtype='<f8').reshape(-1, 125)
        current['focusFeatures'] = errors.argmax(axis=1).tolist()
        current['examples'] = []
        for example in model['examples']:
            start = example['start']
            chunk = next(c for c in model['windows']['chunks'] if c['start'] <= start < c['start'] + c['count'])
            recon = np.fromfile(PUBLIC / chunk['file'], dtype='<f4').reshape(-1, 64, 125)[start - chunk['start']]
            squared = (raw[start:start + 64] - recon.astype(float)) ** 2
            prediction = squared.mean(axis=1) > model['windowThreshold']
            code = example['code']
            matches = (labels[start:start + 64] == (code in ('tp', 'fn'))) & (prediction == (code in ('tp', 'fp')))
            candidates = np.flatnonzero(matches)
            if not len(candidates):
                raise ValueError(f'{model["id"]} example {code} has no matching point')
            # Preserve the selected point when valid; otherwise choose the closest actual outcome.
            point = int(candidates[np.argmin(abs(candidates - (example['index'] - start)))])
            feature = example['feature'] if start + point == example['index'] else int(squared[point].argmax())
            current['examples'].append({**example, 'index': start + point, 'feature': feature})
        result['models'].append(current)
    return result


def export():
    source = json.loads((REFERENCE / 'manifest.json').read_text(encoding='utf-8'))
    result = runtime_manifest(source)
    (PUBLIC / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Runtime manifest: {(PUBLIC / "manifest.json").stat().st_size} bytes')


if __name__ == '__main__':
    export()
