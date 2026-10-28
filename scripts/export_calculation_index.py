"""Derive per-window scores from the published outputs, without running inference."""
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / 'public/data/journey'


def main():
    data = json.loads((ROOT / 'manifest.json').read_text(encoding='utf8'))
    source = np.fromfile(ROOT / data['input']['file'], dtype='<f8').reshape(-1, 125)
    target = ROOT / 'calculation-v1'
    target.mkdir(exist_ok=True)
    manifest = {'resultVersion': data['resultVersion'], 'window': 64, 'features': 125, 'models': {}}
    for model in data['models']:
        if model['id'] not in ('model1', 'model2'):
            continue
        scores = np.empty((model['windows']['count'], 64), dtype='<f8')
        for chunk in model['windows']['chunks']:
            recon = np.fromfile(ROOT / chunk['file'], dtype='<f4').reshape(chunk['count'], 64, 125)
            for local in range(chunk['count']):
                start = chunk['start'] + local
                scores[start] = ((source[start:start + 64] - recon[local].astype(float)) ** 2).mean(axis=1)
        total = np.zeros(len(source))
        coverage = np.zeros(len(source), dtype=int)
        for start, row in enumerate(scores):
            total[start:start + 64] += row
            coverage[start:start + 64] += 1
        difference = float(np.max(np.abs(total / coverage - model['scores'])))
        assert difference < 1e-12, difference
        assert coverage.tolist() == model['coverage']
        file = target / (model['id'] + '-scores.bin')
        file.write_bytes(scores.tobytes())
        manifest['models'][model['id']] = {
            'file': file.relative_to(ROOT).as_posix(), 'shape': list(scores.shape),
            'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'maxAggregateDifference': difference,
        }
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == '__main__':
    main()
