"""Publish only the exact data and indexes used by the browser."""
from dataset_paths import selected_paths, dataset_info
from pathlib import Path
import json
import numpy as np
from data_geometry import geometry, INPUT_CHUNK_ROWS, CONTRIBUTION_CHUNK_ROWS
import hashlib
from array_assets import read_array, write_array

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'data/reference'
PUBLIC = ROOT / 'public/data/journey'


def runtime_manifest(source, reference=REFERENCE):
    rows, features, window = geometry(source)
    result = {key: source[key] for key in (
        'schemaVersion', 'resultVersion', 'window', 'features', 'times', 'labels',
        'input', 'labelMatrix', 'summary', 'removedFeatures')}
    result['dataset'] = dataset_info(source)
    for key in ('normalization',):
        if key in source: result[key] = source[key]
    result['datasets'] = {'train': source['datasets']['train']}
    result['models'] = []
    result['inputChunkRows'] = INPUT_CHUNK_ROWS
    labels = np.asarray(source['labels'], dtype=bool)
    raw = read_array(reference, source['input'])
    for model in source['models']:
        current = {key: model[key] for key in (
            'id', 'name', 'threshold', 'windowThreshold', 'scores', 'history', 'recon', 'metrics', 'run')}
        current['windows'] = {key: model['windows'][key] for key in ('chunks', 'count')}
        current['windows'].update(length=window, features=features)
        errors = read_array(reference, model['errors'])
        chunks = []
        for start in range(0, rows, CONTRIBUTION_CHUNK_ROWS):
            payload = errors[start:start + CONTRIBUTION_CHUNK_ROWS].astype('<f8').tobytes()
            chunks.append({'start': start, 'count': min(CONTRIBUTION_CHUNK_ROWS, rows - start),
                           'file': f'contributions-v1/{model["id"]}/{start}.bin',
                           'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
        current['contributions'] = {'chunks': chunks, 'features': features}
        current['focusFeatures'] = errors.argmax(axis=1).tolist()
        current['examples'] = []
        for example in model['examples']:
            start = example['start']
            chunk = next(c for c in model['windows']['chunks'] if c['start'] <= start < c['start'] + c['count'])
            recon = np.fromfile(reference / chunk['file'], dtype='<f4').reshape(-1, window, features)[start - chunk['start']]
            squared = (raw[start:start + window] - recon.astype(float)) ** 2
            prediction = squared.mean(axis=1) > model['windowThreshold']
            code = example['code']
            matches = (labels[start:start + window] == (code in ('tp', 'fn'))) & (prediction == (code in ('tp', 'fp')))
            candidates = np.flatnonzero(matches)
            if not len(candidates):
                raise ValueError(f'{model["id"]} example {code} has no matching point')
            # Preserve the selected point when valid; otherwise choose the closest actual outcome.
            point = int(candidates[np.argmin(abs(candidates - (example['index'] - start)))])
            feature = example['feature'] if start + point == example['index'] else int(squared[point].argmax())
            current['examples'].append({**example, 'index': start + point, 'feature': feature})
        result['models'].append(current)
    return result


def export(reference=REFERENCE, public=PUBLIC):
    source = json.loads((reference / 'manifest.json').read_text(encoding='utf-8'))
    result = runtime_manifest(source, reference)
    public.mkdir(parents=True, exist_ok=True)
    for original, model in zip(source['models'], result['models']):
        errors = read_array(reference, original['errors'])
        for chunk in model['contributions']['chunks']:
            write_array(public, chunk['file'], errors[chunk['start']:chunk['start'] + chunk['count']])
    (public / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Runtime manifest: {(public / "manifest.json").stat().st_size} bytes')


if __name__ == '__main__':
    export(*selected_paths())
