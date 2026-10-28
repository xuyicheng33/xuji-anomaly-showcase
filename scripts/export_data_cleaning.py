"""Derive the cleaning illustrations from the preserved full raw and clean records."""
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/data/journey'

def export():
    manifest = json.loads((BASE / 'manifest.json').read_text(encoding='utf-8'))
    def read(name):
        asset = manifest['datasets'][name]
        payload = (BASE / asset['file']).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == asset['sha256']
        return np.frombuffer(payload, dtype='<f8').reshape(asset['shape']), asset
    raw, raw_meta = read('raw')
    clean, clean_meta = read('clean')
    invalid = ~np.isfinite(raw).any(axis=1)
    blocks = []
    start = 0
    while start < len(raw):
        if not invalid[start]:
            start += 1
            continue
        end = start + 1
        while end < len(raw) and invalid[end]:
            end += 1
        assert all(t == '---' for t in raw_meta['times'][start:end])
        blocks.append({'start': start, 'end': end, 'count': end-start,
                       'previousTime': raw_meta['times'][start-1] if start else None,
                       'nextTime': raw_meta['times'][end] if end < len(raw) else None})
        start = end
    removed = [key for i, key in enumerate(raw_meta['keys']) if not np.isfinite(raw[:, i]).any()]
    assert removed == manifest['removedFeatures'] and len(removed) == 11
    kept_columns = [raw_meta['keys'].index(key) for key in clean_meta['keys']]
    valid_raw = raw[~invalid][:, kept_columns]
    assert len(clean) == 7992 and invalid.sum() == 768
    # Two existing workbook cells were rounded at the 1e-9 scale on export.
    np.testing.assert_allclose(np.nan_to_num(valid_raw, nan=0), clean, atol=2e-9, rtol=0)
    missing = ~np.isfinite(valid_raw)
    assert missing.sum() == 170
    assert np.all(clean[missing] == 0)
    examples = []
    for key, timestamp, label in [
        ('22T11_L2_LINE_TEMP_a', '2022-03-29 06:00', '单点缺失'),
        ('22T12_L1_LINE_TEMP_a', '2022-03-07 12:00', '连续缺失')]:
        col = clean_meta['keys'].index(key)
        row = clean_meta['times'].index(timestamp)
        rows = [{'time': clean_meta['times'][i],
                 'before': float(valid_raw[i, col]) if np.isfinite(valid_raw[i, col]) else None,
                 'after': float(clean[i, col])} for i in range(row-2, row+3)]
        examples.append({'key': key, 'label': label, 'feature': col, 'from': row-2, 'rows': rows})
    def raw_value(row, key):
        value = raw[row, raw_meta['keys'].index(key)]
        return float(value) if np.isfinite(value) else None
    raw_keys = ['21V00_UD_CONV_a', '22T11_L2_LINE_TEMP_a', removed[0]]
    raw_start = raw_meta['times'].index('2022-03-29 04:00')
    raw_example = {'keys': raw_keys, 'rows': [
        {'number': i+1, 'time': raw_meta['times'][i],
         'values': [raw_value(i, key) for key in raw_keys]}
        for i in range(raw_start, raw_start+5)]}
    crop_key = '21V00_UD_CONV_a'
    crop_examples = []
    for block in blocks:
        before = [{'start': i+1, 'end': i+1, 'time': raw_meta['times'][i],
                   'value': raw_value(i, crop_key), 'removed': False}
                  for i in range(max(0, block['start']-2), block['start'])]
        omitted = {'start': block['start']+1, 'end': block['end'], 'time': None,
                   'value': None, 'removed': True}
        after = [{'start': i+1, 'end': i+1, 'time': raw_meta['times'][i],
                  'value': raw_value(i, crop_key), 'removed': False}
                 for i in range(block['end'], min(len(raw), block['end']+2))]
        crop_examples.append({'key': crop_key, 'count': block['count'],
                              'rows': before+[omitted]+after})
    split = int(len(clean)*.7)
    result = {'source': {'rawSHA256': raw_meta['sha256'], 'cleanSHA256': clean_meta['sha256']},
              'invalidBlocks': blocks, 'removedSensors': removed,
              'missingCells': int(missing.sum()), 'affectedSensors': int(missing.any(axis=0).sum()),
              'missingExamples': examples, 'rawExample': raw_example,
              'cropExamples': crop_examples,
              'split': {'trainCount': split, 'testCount': len(clean)-split,
                        'trainStart': clean_meta['times'][0], 'trainEnd': clean_meta['times'][split-1],
                        'testStart': clean_meta['times'][split], 'testEnd': clean_meta['times'][-1]}}
    (ROOT / 'src/report/cleaning-data.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Verified {len(blocks)} invalid blocks, {len(removed)} removed sensors, {missing.sum()} filled cells')

if __name__ == '__main__':
    export()
