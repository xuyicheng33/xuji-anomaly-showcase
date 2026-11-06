"""Derive per-window scores from the published outputs, without running inference."""
from dataset_paths import selected_paths
from pathlib import Path
import json
import numpy as np
from data_geometry import geometry
from array_assets import read_array, write_array, window_scores

ROOT = Path(__file__).resolve().parents[1] / 'public/data/journey'
REFERENCE = ROOT.parents[2] / 'data/reference'


def main(reference=REFERENCE, public=ROOT):
    data = json.loads((reference / 'manifest.json').read_text(encoding='utf8'))
    _, features, window = geometry(data)
    source = read_array(reference, data['input'])
    target = public / 'calculation-v1'
    target.mkdir(exist_ok=True)
    manifest = {'resultVersion': data['resultVersion'], 'window': window, 'features': features, 'models': {}}
    for model in data['models']:
        scores = np.empty((model['windows']['count'], window), dtype='<f8')
        for chunk in model['windows']['chunks']:
            recon = np.fromfile(reference / chunk['file'], dtype='<f4').reshape(chunk['count'], window, features)
            for local in range(chunk['count']):
                start = chunk['start'] + local
                scores[start] = window_scores(source[start:start + window], recon[local])
        total = np.zeros(len(source))
        coverage = np.zeros(len(source), dtype=int)
        for start, row in enumerate(scores):
            total[start:start + window] += row
            coverage[start:start + window] += 1
        difference = float(np.max(np.abs(total / coverage - model['scores'])))
        assert difference < 1e-12, difference
        assert coverage.tolist() == model['coverage']
        asset = write_array(public, f'calculation-v1/{model["id"]}-scores.bin', scores)
        manifest['models'][model['id']] = {**asset, 'maxAggregateDifference': difference}
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == '__main__':
    main(*selected_paths())
