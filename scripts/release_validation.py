"""Check that a release uses the verified evaluation version, without choosing thresholds."""
import json
import re
from pathlib import Path


def window_location_config(existing, location):
    """Replace the dedicated window rule, keeping every unrelated site directive."""
    if 'listen 9010;' not in existing or 'root /var/www/xuji-showcase/current;' not in existing:
        raise ValueError('Unexpected dedicated site configuration')
    lines = existing.splitlines(keepends=True)
    header = location.strip().splitlines()[0].strip()
    if not re.fullmatch(r'location \^~ /data/(journey|wind)/windows-v1/ \{', header):
        raise ValueError('Unexpected window location')
    begin = next((i for i, line in enumerate(lines) if line.strip() == header), None)
    if begin is not None:
        end = next(i for i in range(begin + 1, len(lines)) if lines[i].strip() == '}')
        lines[begin:end + 1] = [location + '\n']
    else:
        begin = next(i for i, line in enumerate(lines) if line.strip().startswith('location ~ ^/data/'))
        lines.insert(begin, location + '\n')
    return ''.join(lines)


def validate_evaluation(folder, reference):
    folder = Path(folder)
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
    evaluation = json.loads((folder / 'evaluation.json').read_text(encoding='utf8'))
    source = json.loads(Path(reference).read_text(encoding='utf8'))
    if not manifest['resultVersion'] == evaluation['version'] == source['resultVersion']:
        raise ValueError('Evaluation versions differ')
    if evaluation['policy']['id'] != source['evaluation']['id']:
        raise ValueError('Evaluation policy differs')
    expected = {model['id']: model for model in source['models']}
    actual = {model['id']: model for model in manifest['models']}
    records = {model['id']: model for model in evaluation['models']}
    if not expected.keys() == actual.keys() == records.keys():
        raise ValueError('Evaluation model sets differ')
    for name, model in actual.items():
        for key in ('threshold', 'windowThreshold', 'scores', 'metrics'):
            if model[key] != expected[name][key]:
                raise ValueError(f'Evaluation result differs: {name}/{key}')
        if (model['threshold'] != records[name]['sequence']['value'] or
                model['windowThreshold'] != records[name]['window']['value']):
            raise ValueError(f'Evaluation thresholds differ: {name}')
