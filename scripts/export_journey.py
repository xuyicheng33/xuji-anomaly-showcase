"""Publish the frozen reference data without inference or threshold selection."""
import hashlib
import json
from pathlib import Path
import shutil

from dataset_paths import selected_paths
from evaluation_policy import POLICY
from export_runtime import export as export_runtime
from export_curve_data import main as export_curves
from release_validation import validate_evaluation


def export(reference, public):
    reference, public = Path(reference), Path(public)
    source = json.loads((reference / 'manifest.json').read_text(encoding='utf8'))
    public.mkdir(parents=True, exist_ok=True)
    for model in source['models']:
        for chunk in model['windows']['chunks']:
            original = reference / chunk['file']
            payload = original.read_bytes()
            if len(payload) != chunk['bytes'] or hashlib.sha256(payload).hexdigest() != chunk['sha256']:
                raise ValueError(f'Retained window differs: {chunk["file"]}')
            target = public / chunk['file']
            if not target.exists() or target.read_bytes() != payload:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(original, target)
    if any(source['evaluation'].get(key) != value for key, value in POLICY.items()):
        raise ValueError('Retained evaluation policy differs')
    evaluation = {
        'version': source['resultVersion'],
        'policy': {key: source['evaluation'][key] for key in POLICY},
        'models': [{'id': model['id'], **{key: model['evaluation'][key] for key in ('sequence', 'window')}}
                   for model in source['models']],
    }
    (public / 'evaluation.json').write_text(json.dumps(evaluation, ensure_ascii=False, indent=2), encoding='utf8')
    export_runtime(reference, public)
    export_curves(reference, public)
    validate_evaluation(public, reference / 'manifest.json')


if __name__ == '__main__':
    export(*selected_paths())
