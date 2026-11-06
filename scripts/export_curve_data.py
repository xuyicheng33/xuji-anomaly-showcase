"""Exact float64 column files and window inputs for low-bandwidth curve loading."""
from dataset_paths import selected_paths
from pathlib import Path
import json
import numpy as np
from data_geometry import INPUT_CHUNK_ROWS
from array_assets import read_array

ROOT = Path(__file__).resolve().parents[1] / 'public/data/journey'
REFERENCE = ROOT.parents[2] / 'data/reference'


def main(reference=REFERENCE, public=ROOT):
    data = json.loads((reference / 'manifest.json').read_text(encoding='utf8'))
    assets = [data['input'], data['datasets']['train'], data['labelMatrix'], *(m['recon'] for m in data['models'])]
    written = 0
    for asset in assets:
        values = read_array(reference, asset)
        folder = public / 'curves-v1' / asset['sha256']
        folder.mkdir(parents=True, exist_ok=True)
        for feature in range(values.shape[1]):
            payload = values[:, feature].astype('<f8').tobytes()
            assert np.array_equal(np.frombuffer(payload, dtype='<f8'), values[:, feature], equal_nan=True)
            (folder / f'{feature}.bin').write_bytes(payload)
            written += 1
        if asset['sha256'] in (data['datasets']['train']['sha256'], data['labelMatrix']['sha256']):
            (folder / 'mean.bin').unlink(missing_ok=True)
        else:
            # Same left-to-right summation order as meanSeries in the browser.
            mean = np.zeros(len(values))
            for feature in range(values.shape[1]):
                mean += values[:, feature]
            (folder / 'mean.bin').write_bytes((mean / values.shape[1]).astype('<f8').tobytes())
            written += 1
    values = read_array(reference, data['input'])
    folder = public / 'input-rows-v2' / data['input']['sha256']
    folder.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(values), INPUT_CHUNK_ROWS):
        (folder / f'{start}.bin').write_bytes(values[start:start + INPUT_CHUNK_ROWS].astype('<f8').tobytes())
        written += 1
    print(json.dumps({'files': written, 'fullInputBytes': values.nbytes, 'curveBytes': len(values)*8, 'inputRowChunkBytes': INPUT_CHUNK_ROWS*values.shape[1]*8}))


if __name__ == '__main__':
    main(*selected_paths())
