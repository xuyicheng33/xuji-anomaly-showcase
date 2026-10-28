"""Exact float64 column files and window inputs for low-bandwidth curve loading."""
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1] / 'public/data/journey'


def main():
    data = json.loads((ROOT / 'manifest.json').read_text(encoding='utf8'))
    assets = [data['input'], *data['datasets'].values(), *(m['recon'] for m in data['models'])]
    written = 0
    for asset in assets:
        values = np.fromfile(ROOT / asset['file'], dtype='<f8').reshape(asset['shape'])
        folder = ROOT / 'curves-v1' / asset['sha256']
        folder.mkdir(parents=True, exist_ok=True)
        for feature in range(values.shape[1]):
            payload = values[:, feature].astype('<f8').tobytes()
            assert np.array_equal(np.frombuffer(payload, dtype='<f8'), values[:, feature], equal_nan=True)
            (folder / f'{feature}.bin').write_bytes(payload)
            written += 1
        # Same left-to-right summation order as meanSeries in the browser.
        mean = np.zeros(len(values))
        for feature in range(values.shape[1]):
            mean += values[:, feature]
        (folder / 'mean.bin').write_bytes((mean / values.shape[1]).astype('<f8').tobytes())
        written += 1
    values = np.fromfile(ROOT / data['input']['file'], dtype='<f8').reshape(-1, 125)
    folder = ROOT / 'input-rows-v1' / data['input']['sha256']
    folder.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(values), 128):
        (folder / f'{start}.bin').write_bytes(values[start:start + 128].astype('<f8').tobytes())
        written += 1
    print(json.dumps({'files': written, 'fullInputBytes': values.nbytes, 'curveBytes': len(values)*8, 'inputRowChunkBytes': 128*125*8}))


if __name__ == '__main__':
    main()
