"""Validate remote exports and install an independently versioned static package."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from export_anomaly_cases import construct, VERSION

def metrics(y, p):
    y, p = np.asarray(y, bool), np.asarray(p, bool)
    tp, fp, fn, tn = int((y & p).sum()), int((~y & p).sum()), int((y & ~p).sum()), int((~y & ~p).sum())
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=tp/(tp+fp) if tp+fp else None,
                recall=tp/(tp+fn) if tp+fn else None, f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None)


def install(source, target, journey):
    source, target = Path(source), Path(target)
    target.mkdir(parents=True, exist_ok=True)
    data = json.loads(Path(journey).read_text(encoding='utf-8'))
    exports = {m: json.loads((source / f'{m}.json').read_text(encoding='utf-8')) for m in ['model1', 'model2']}
    clean = np.fromfile(Path(journey).parent / 'clean-test.bin', dtype='<f8').reshape(-1, 125)
    expected = {c['id']: c for c in construct(clean)}
    records = []

    def asset(name, value):
        a = np.asarray(value, dtype='<f8')
        p = target / (name + '.bin')
        p.write_bytes(a.tobytes())
        return dict(file='anomaly-cases-v1/' + p.name, shape=list(a.shape), bytes=p.stat().st_size,
                    sha256=hashlib.sha256(p.read_bytes()).hexdigest())

    first = exports['model1']['cases'][0]
    original = asset('original', first['original'])
    mask = asset('mask', first['mask'])
    names = {'reference': '参考片段', 'uniform': '均匀值', 'peak': '峰值噪声', 'length': '长度调整'}
    for c in exports['model1']['cases']:
        cid = c['id']
        other = next(v for v in exports['model2']['cases'] if v['id'] == cid)
        for key in ['original', 'candidate', 'weights', 'input', 'labels', 'mask']:
            assert np.array_equal(c[key], other[key]), (cid, key, 'model input differs')
            np.testing.assert_allclose(c[key], expected[cid][key], rtol=0, atol=1e-14)
        x, original_values, labels = (np.asarray(c[k]) for k in ['input', 'original', 'labels'])
        assert np.all(np.abs(x - original_values)[labels == 0] < 1e-12)
        rec = {k: c[k] for k in ['id', 'insertion', 'kind', 'start', 'begin', 'end', 'feature', 'features', 'source']}
        material = np.asarray(c['original']).copy()
        if c['kind'] == 'reference':
            material[c['begin']:c['end'], c['features']] = clean[175:199, c['features']]
        rec.update(name=('替换' if c['insertion'] == 'replace' else '混合') + ' · ' + names[c['kind']],
                   times=data['times'][c['start']:c['start'] + 64], original=original, mask=mask,
                   material=asset(cid + '-material', material),
                   **{k: asset(cid + '-' + k, c[k]) for k in ['candidate', 'weights', 'input', 'labels']})
        rec['models'] = []
        for m in data['models']:
            raw = next(v for v in exports[m['id']]['cases'] if v['id'] == cid)
            recon = np.asarray(raw['recon'])
            errors = (x - recon) ** 2
            np.testing.assert_allclose(raw['scores'], errors.mean(1), rtol=0, atol=1e-14)
            np.testing.assert_allclose(raw['errors'], errors, rtol=0, atol=1e-14)
            threshold = m['windowThreshold']
            rec['models'].append(dict(id=m['id'], name=m['name'], recon=asset(cid + '-' + m['id'], recon),
                                      scores=errors.mean(1).tolist(), threshold=threshold,
                                      metrics=metrics(labels.any(1), errors.mean(1) > threshold)))
        records.append(rec)
    manifest = dict(version=VERSION, seed=20261028, cases=records,
                    provenance={m: {'sources': e['sources'], 'device': e['device'], 'policy': e['policy']} for m, e in exports.items()},
                    construction='Four candidate generators crossed with replacement / 0.7 blending. Controlled new offline cases, not historical static/dynamic combinations.',
                    lengthPolicy='Repeat 8 points by scale 3 inside a 24-point interval; no tail shift or unlabelled feature changes.',
                    thresholdPolicy='Reuse frozen independent-window thresholds; never optimize on these eight cases.')
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS {len(records)} cases × 2 models; sources, composition, labels and all 125-feature errors verified')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='.qa/cases-20261028/raw')
    p.add_argument('--target', default='public/data/journey/anomaly-cases-v1')
    p.add_argument('--journey', default='public/data/journey/manifest.json')
    a = p.parse_args()
    install(a.source, a.target, a.journey)

