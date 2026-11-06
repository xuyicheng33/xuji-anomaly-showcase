"""Exact array I/O for browser payload exporters."""
import hashlib
from pathlib import Path

import numpy as np


def read_array(folder, asset, dtype='<f8'):
    return np.fromfile(folder / asset['file'], dtype=dtype).reshape(asset['shape'])


def write_array(folder, name, values):
    values = np.asarray(values, dtype='<f8')
    payload = values.tobytes()
    path = folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return {'file': Path(name).as_posix(), 'shape': list(values.shape),
            'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}


def window_scores(source, predictions):
    return ((source - predictions.astype(float)) ** 2).mean(axis=1)
