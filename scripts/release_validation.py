"""Check that a release uses the verified evaluation version, without choosing thresholds."""
import json
from pathlib import Path


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
