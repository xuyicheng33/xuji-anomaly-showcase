"""Publish the frozen reference data without inference or threshold selection."""
import hashlib
import json
from pathlib import Path
import shutil
import os
import tempfile

from dataset_paths import selected_paths
from evaluation_policy import POLICY
from export_runtime import export as export_runtime
from export_curve_data import main as export_curves
from release_validation import validate_evaluation


def build_export(reference, public):
    reference, public = Path(reference), Path(public)
    source = json.loads((reference / 'manifest.json').read_text(encoding='utf8'))
    if any(source['evaluation'].get(key) != value for key, value in POLICY.items()):
        raise ValueError('Retained evaluation policy differs')
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


def export(reference, public):
    """Generate a complete sibling tree; failed exports leave the published tree intact."""
    reference, public = Path(reference).resolve(), Path(public).absolute()
    if public.is_symlink():
        raise ValueError('Export destination must not be a symbolic link')
    public = public.resolve()
    if public == reference or public in reference.parents or reference in public.parents:
        raise ValueError('Export destination must be separate from retained sources')
    public.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f'.{public.name}-export-', dir=public.parent))
    candidate, previous = temporary / 'next', temporary / 'previous'
    preserve = False
    try:
        build_export(reference, candidate)
        existed = public.exists()
        if existed:
            os.replace(public, previous)
        try:
            os.replace(candidate, public)
        except BaseException as failure:
            if existed:
                try:
                    os.replace(previous, public)
                except OSError as restore_error:
                    preserve = True
                    failure.add_note(f'Previous export retained at {previous}: {restore_error}')
            raise
    finally:
        if not preserve:
            shutil.rmtree(temporary)


if __name__ == '__main__':
    export(*selected_paths())
