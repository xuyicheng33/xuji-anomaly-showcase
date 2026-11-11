"""Publish only the exact data and indexes used by the browser."""
from dataset_paths import selected_paths, dataset_info
from pathlib import Path
import json
import numpy as np
from data_geometry import geometry, INPUT_CHUNK_ROWS, CONTRIBUTION_CHUNK_ROWS
import hashlib
from array_assets import read_array, write_array, curve_columns

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'data/reference'
PUBLIC = ROOT / 'public/data/journey'


def window_integrity(reference, chunk, window, features):
    predictions = read_array(reference, {**chunk, 'shape': [chunk['count'], window, features]}, '<f4')
    hashes = [hashlib.sha256(values.tobytes()).digest() for values in predictions]
    # Each covering-row request follows window-start order within this chunk.
    for index in range(chunk['count'] + window - 1):
        rows = b''.join(predictions[start, index - start].tobytes()
                        for start in range(max(0, index - window + 1), min(index + 1, chunk['count'])))
        hashes.append(hashlib.sha256(rows).digest())
    return np.frombuffer(b''.join(hashes), dtype='uint8').reshape(-1, 32)


def runtime_manifest(source, reference=REFERENCE):
    rows, features, window = geometry(source)
    result = {key: source[key] for key in (
        'schemaVersion', 'resultVersion', 'window', 'features', 'times', 'labels',
        'input', 'labelMatrix', 'summary', 'removedFeatures')}
    result['dataset'] = dataset_info(source)
    for key in ('normalization',):
        if key in source: result[key] = source[key]
    def with_curves(asset, include_mean):
        values = read_array(reference, asset)
        curves = {name: hashlib.sha256(column.astype('<f8').tobytes()).hexdigest()
                  for name, column in curve_columns(values, include_mean)}
        return {**asset, 'curves': curves}

    result['input'] = with_curves(source['input'], True)
    result['labelMatrix'] = with_curves(source['labelMatrix'], False)
    result['datasets'] = {'train': with_curves(source['datasets']['train'], False)}
    result['models'] = []
    result['inputChunkRows'] = INPUT_CHUNK_ROWS
    labels = np.asarray(source['labels'], dtype=bool)
    raw = read_array(reference, source['input'])
    result['inputRowHashes'] = [hashlib.sha256(raw[start:start + INPUT_CHUNK_ROWS].astype('<f8').tobytes()).hexdigest()
                                for start in range(0, rows, INPUT_CHUNK_ROWS)]
    for model in source['models']:
        current = {key: model[key] for key in (
            'id', 'name', 'threshold', 'windowThreshold', 'scores', 'history', 'recon', 'metrics', 'run')}
        current['recon'] = with_curves(model['recon'], True)
        window_chunks = []
        for chunk in model['windows']['chunks']:
            hashes = window_integrity(reference, chunk, window, features)
            integrity = dict(file=f'windows-integrity-v1/{model["id"]}/{chunk["start"]}.bin',
                             shape=list(hashes.shape), bytes=hashes.nbytes,
                             sha256=hashlib.sha256(hashes.tobytes()).hexdigest())
            window_chunks.append({**chunk, 'integrity': integrity})
        current['windows'] = dict(chunks=window_chunks, count=model['windows']['count'],
                                  length=window, features=features)
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
        for chunk in model['windows']['chunks']:
            write_array(public, chunk['integrity']['file'],
                        window_integrity(reference, chunk, result['window'], len(result['features'])), 'uint8')
    (public / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Runtime manifest: {(public / "manifest.json").stat().st_size} bytes')


if __name__ == '__main__':
    export(*selected_paths())
