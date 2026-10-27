"""Verify the frozen website bundle without connecting to research infrastructure."""
import hashlib
import json
import math
import struct
from pathlib import Path
from datetime import datetime, timedelta

ROOT = Path(__file__).resolve().parents[1]


def verify() -> None:
    data = json.loads((ROOT / 'public/data/research.json').read_text(encoding='utf-8'))
    provenance = json.loads((ROOT / 'public/data/provenance.json').read_text(encoding='utf-8'))
    pages = json.loads((ROOT / 'src/content/pages.json').read_text(encoding='utf-8'))
    assert [p['id'] for p in pages] == list(range(1, 62))
    assert len(data['values']) == len(data['times']) == 8759
    assert all(len(row) == 28 for row in data['values'])
    assert all(isinstance(value, (int, float)) and math.isfinite(value) for row in data['values'] for value in row)
    assert data['split'] == 6131 and data['labelShape'] == [2628, 28]
    assert data['initialPositiveLabels'] == 0
    assert len(data['columns']) == 42
    assert data['features'][0]['key'] == 'actualvalue'
    assert data['features'][1]['key'] == 'forecastvalue'
    assert len(set(f['key'] for f in data['features'])) == 28
    for index, feature in enumerate(data['features']):
        training = [row[index] for row in data['values'][:data['split']]]
        assert min(training) == feature['min'] and max(training) == feature['max'], feature['key']
    dates = [datetime.fromisoformat(t) for t in data['times']]
    assert dates[0] == datetime(2025, 4, 2, 18, 15)
    assert dates[-1] == datetime(2025, 7, 2, 23, 45)
    assert all(b-a == timedelta(minutes=15) for a, b in zip(dates, dates[1:]))
    assert data['times'][data['split']] == '2025-06-05 15:00'
    assert len(data['changes']) == 62
    assert data['old']['positiveCells'] == 936 and data['old']['positiveTimes'] == 558
    old = data['old']
    assert len(old['inserted_values']) == len(old['inserted_labels']) == 1752
    assert all(len(row) == 7 for row in old['inserted_values'] + old['inserted_labels'])
    assert sum(bool(value) for row in old['inserted_labels'] for value in row) == old['positiveCells']
    assert sum(any(row) for row in old['inserted_labels']) == old['positiveTimes']
    assert len(data['old']['history']) == 5
    assert [row['f1'] for row in data['metrics']] == [.8632, .8347, .8237]
    assert len(data['duplicateWeather']) == 8
    assert len({row['datatime'] for row in data['duplicateWeather']}) == 4
    for stream in (s for s in data['streams'] if s['used']):
        segments = stream['coverage']
        assert segments[0]['start'] == stream['start'] and segments[-1]['end'] == stream['end']
        assert all(segment['points'] > 0 for segment in segments)
        assert all(datetime.fromisoformat(a['end']) < datetime.fromisoformat(b['start']) for a, b in zip(segments, segments[1:]))
    assert len({source['id'] for source in provenance['sources']}) == len(provenance['sources'])
    sources = {source['id']: source for source in provenance['sources']}
    for entry in provenance['assets']:
        path = ROOT / 'public' / entry['file']
        assert path.stat().st_size == entry['bytes'], path
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], path
        if path.suffix == '.png':
            assert entry['sourceId'] in sources
            content = path.read_bytes()
            position, origin = 8, None
            while position < len(content) - 12:
                length = struct.unpack('>I', content[position:position+4])[0]
                kind = content[position+4:position+8]
                payload = content[position+8:position+8+length]
                if kind == b'tEXt' and payload.startswith(b'impeccable:prompt\x00'):
                    origin = json.loads(payload.split(b'\x00', 1)[1])
                position += length + 12
            assert origin and origin['sha256'] == sources[entry['sourceId']]['sha256'], path
    print(f"[PASS] 61 steps, 8,759 × 28 values, split, labels, report metrics, {len(provenance['sources'])} sources and all {len(provenance['assets'])} asset hashes.")


if __name__ == '__main__':
    verify()
