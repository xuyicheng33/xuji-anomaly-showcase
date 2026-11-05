"""Verify shipped cases independently of the authoring UI and remote runtime."""
import hashlib
import json
from pathlib import Path

import numpy as np
from dataset_paths import selected_paths


REFERENCE, ROOT = selected_paths()


def read(asset):
    raw = (ROOT / asset['file']).read_bytes()
    assert len(raw) == asset['bytes']
    assert hashlib.sha256(raw).hexdigest() == asset['sha256']
    a = np.frombuffer(raw, '<f8').reshape(asset['shape'])
    assert np.isfinite(a).all()
    return a


def verify():
    manifest = json.loads((ROOT / 'anomaly-cases-v1/manifest.json').read_text(encoding='utf-8'))
    published = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    clean = np.fromfile(REFERENCE / 'clean-test.bin', dtype='<f8').reshape(-1, len(published['features']))
    reference = json.loads((REFERENCE / ('cases/' + published['models'][0]['id'] + '.json')).read_text(encoding='utf-8'))
    masks = {c['id']: np.asarray(c['mask']) for c in reference['cases']}
    used = {'anomaly-cases-v1/manifest.json'}
    expected = {f'{mode}-{kind}' for mode in ['replace', 'blend'] for kind in ['reference', 'uniform', 'peak', 'length']}
    assert {c['id'] for c in manifest['cases']} == expected
    for c in manifest['cases']:
        values = {k: read(c[k]) for k in ['original', 'material', 'candidate', 'weights', 'input', 'labels']}
        used.update(c[k]['file'] for k in values)
        original, candidate, weights, x, labels = (values[k] for k in ['original', 'candidate', 'weights', 'input', 'labels'])
        np.testing.assert_array_equal(original, clean[c['start']:c['start'] + 64])
        np.testing.assert_allclose(x, (1 - weights) * original + weights * candidate, rtol=0, atol=1e-14)
        assert set(np.unique(labels)) <= {0, 1}
        assert set(np.unique(masks[c['id']])) == {0, 1}
        assert np.all((masks[c['id']] == 0).sum(0) == 16)
        assert np.all(weights >= 0) and np.all(weights <= 1)
        assert np.all(np.abs(x - original)[labels == 0] < 1e-12)
        features = c['features']
        if c['kind'] == 'peak':
            changed = np.any(np.abs(x - original) > 1e-12, axis=1)
            assert changed.sum() == 1 and changed[30]
            np.testing.assert_array_equal(np.flatnonzero(labels.any(1)), np.arange(26, 35))
        else:
            np.testing.assert_array_equal(np.flatnonzero(labels.any(1)), np.arange(18, 42))
        if c['kind'] == 'length':
            np.testing.assert_array_equal(candidate[18:42, features], np.repeat(original[18:26, features], 3, axis=0))
            np.testing.assert_array_equal(x[42:], original[42:])
        if c['kind'] == 'uniform':
            assert np.all(np.ptp(candidate[18:42, features], axis=0) == 0)
        if c['kind'] == 'reference':
            np.testing.assert_array_equal(candidate[18:42, features], 1-clean[175:199, features][::-1])
        for model in c['models']:
            recon = read(model['recon'])
            used.add(model['recon']['file'])
            scores = ((x - recon) ** 2).mean(1)
            np.testing.assert_allclose(scores, model['scores'], rtol=0, atol=1e-14)
            source_model = next(m for m in published['models'] if m['id'] == model['id'])
            assert model['threshold'] == source_model['windowThreshold']
            y, p = labels.any(1), scores > model['threshold']
            counts = dict(tp=int((y & p).sum()), fp=int((~y & p).sum()), fn=int((y & ~p).sum()), tn=int((~y & ~p).sum()))
            for key, value in counts.items():
                assert value == model['metrics'][key]
        print('PASS', c['id'], 'source, material, composition, labels, masks and all model outputs')
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'anomaly-cases-v1').rglob('*') if p.is_file()}
    assert actual == used, {'extra': sorted(actual - used), 'missing': sorted(used - actual)}
    # Averaging can cancel opposing residuals; RMS retains the actual anomaly energy.
    x = np.array([[1., -1.]])
    recon = np.zeros_like(x)
    assert (x.mean() - recon.mean()) ** 2 == 0
    assert ((x - recon) ** 2).mean() == 1
    print('PASS mean curves must not substitute for mean squared reconstruction error')


if __name__ == '__main__':
    verify()
