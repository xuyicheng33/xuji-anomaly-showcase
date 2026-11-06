"""Exact array I/O for browser payload exporters."""
import hashlib
from pathlib import Path

import numpy as np


def read_array(folder, asset, dtype='<f8'):
    path = folder / asset['file']
    payload = path.read_bytes()
    if len(payload) != asset['bytes'] or hashlib.sha256(payload).hexdigest() != asset['sha256']:
        raise ValueError(f'Array checksum or length differs: {path}')
    return np.frombuffer(payload, dtype=dtype).reshape(asset['shape'])


def curve_columns(values, include_mean):
    """Retain browser summation order when deriving the mean curve."""
    mean = np.zeros(len(values))
    for feature in range(values.shape[1]):
        yield str(feature), values[:, feature]
        if include_mean:
            mean += values[:, feature]
    if include_mean:
        yield 'mean', mean / values.shape[1]


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
