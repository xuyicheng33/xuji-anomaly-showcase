"""Export eight controlled construction cases and actual retained-model outputs.

Run separately for each model on the research host (CPU is sufficient). This is
an offline demonstration package, not a recreation of the historical injection
seed or a replacement for the published test set. Never writes research inputs,
labels, checkpoints, or the original test metrics.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np


VERSION = 'anomaly-cases-v1-20261028'
START, BEGIN, END, SEED = 107, 18, 42, 20261028
EXPECTED = {
    'model1': '8ced8979ad743d66dab27b88a0c969c4125b87c79980d5d6d1ba5a0b73e4f6ab',
    'model2': '2a26778d1521bf4c6eda09d1dd0faf1a9d99d6334d06efe9df3fa3aad2c4b28e',
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def construct(clean):
    """Separate candidate construction from replacement/blending composition.

    Reference flipping, uniform value, peak selection and repeat-interleave
    follow demoNew03.py. Lengthening is restricted to the selected interval and
    dimensions: the historical function also shifts the tail without labeling
    all changed dimensions; that behavior is deliberately not copied.
    """
    base = clean[START:START + 64].copy()
    # A fixed multivariate selection makes the aggregate score interpretable.
    features = [4, 5, 6, 9, 11, 13, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32,
                34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64]
    rng = np.random.default_rng(SEED)
    mask = np.ones((64, 125), np.uint8)
    for f, begin in enumerate(rng.integers(0, 49, 125)):
        mask[begin:begin + 16, f] = 0
    cases = []
    for kind in ['reference', 'uniform', 'peak', 'length']:
        candidate = base.copy()
        labels = np.zeros_like(base, np.uint8)
        weights = np.zeros_like(base)
        source = {'file': 'processed/converterold/converter_test.npy', 'start': START}
        active = np.zeros_like(base, bool)
        if kind == 'reference':
            source.update(referenceStart=175, verticalFlip=True, horizontalFlip=True)
            reference = 1 - clean[175:199, features][::-1]
            candidate[BEGIN:END, features] = reference
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
        elif kind == 'uniform':
            values = rng.uniform(.08, .18, len(features))
            values[features.index(4)] = .923039436340332
            candidate[BEGIN:END, features] = values
            source.update(values=values.tolist())
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
        elif kind == 'peak':
            peak = 30
            opposite = (base[peak, features] < .5).astype(float)
            values = opposite + .1 * (1 - 2 * opposite) * rng.random(len(features))
            candidate[peak, features] = values
            active[peak, features] = True
            labels[peak - 4:peak + 5, features] = 1
            source.update(peak=peak, patchSize=4, values=values.tolist())
        else:
            scale = 3
            candidate[BEGIN:END, features] = np.repeat(base[BEGIN:BEGIN + 8, features], scale, axis=0)
            active[BEGIN:END, features] = True
            labels[BEGIN:END, features] = 1
            source.update(scale=scale, sourceBegin=BEGIN, sourceEnd=BEGIN + 8,
                          boundary='selected interval and features only; tail unchanged')
        for insertion in ['replace', 'blend']:
            weights.fill(0)
            weights[active] = 1 if insertion == 'replace' else .7
            if insertion == 'blend' and kind != 'peak':
                # Same 10% warmup/cooldown rule as the research soft replacement.
                warmup = (END - BEGIN) // 10
                envelope = np.r_[np.linspace(0, .7, warmup),
                                 np.full(END - BEGIN - 2 * warmup, .7),
                                 np.linspace(.7, 0, warmup)]
                weights[BEGIN:END, features] = envelope[:, None]
            after = base * (1 - weights) + candidate * weights
            cases.append(dict(id=f'{insertion}-{kind}', insertion=insertion, kind=kind,
                              start=START, begin=BEGIN, end=END, feature=4 if kind in ['uniform', 'length'] else 5,
                              features=features, source=source, original=base.copy(), candidate=candidate.copy(),
                              weights=weights.copy(), input=after, labels=labels.copy(), mask=mask.copy()))
    return cases


def run(model_id, project, output):
    import torch
    project, output = Path(project).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = project / 'checkpoints/DTAAD_converter/model.ckpt'
    assert sha(checkpoint) == EXPECTED[model_id], 'Checkpoint differs from accepted experiment'
    clean_path = project / 'processed/converterold/converter_test.npy'
    assert sha(clean_path) == 'c5bd71d3d4379cbf89092861fe5b4cc16a736732218ffcfb2de854ad5dfcf591'
    clean = np.load(clean_path)
    cases = construct(clean)
    torch.set_num_threads(2)
    torch.manual_seed(SEED)
    sys.path.insert(0, str(project))
    sys.argv = ['export-cases', '--dataset', 'converter', '--model', 'DTAAD', '--Device', 'cpu']
    from src.models import DTAAD
    model = DTAAD(125).double().cpu().eval()
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=False)['model_state_dict'], strict=True)
    if hasattr(model, 'save_attn'):
        model.save_attn = False
    sources = {str(p): sha(p) for p in [checkpoint, clean_path, project / 'demoNew03.py', project / 'src/models.py']}
    records = []
    for case in cases:
        value = torch.from_numpy(case['input'][None])
        masked = torch.from_numpy((case['input'] * case['mask'])[None])
        with torch.inference_mode():
            pred = model(value.permute(0, 2, 1), masked.permute(0, 2, 1)) if model_id == 'model1' else model(value, masked)
        recon = pred.cpu().numpy()[0].astype('<f4')
        assert recon.shape == (64, 125) and np.isfinite(recon).all()
        errors = (case['input'] - recon.astype(float)) ** 2
        assert np.all(np.abs(case['input'] - case['original'])[case['labels'] == 0] < 1e-12)
        payload = {key: value.tolist() if isinstance(value, np.ndarray) else value for key, value in case.items()}
        payload.update(recon=recon.tolist(), errors=errors.tolist(), scores=errors.mean(1).tolist())
        records.append(payload)
        print(json.dumps({'model': model_id, 'case': case['id'], 'maxScore': float(errors.mean(1).max())}), flush=True)
    result = {'version': VERSION, 'model': model_id, 'device': 'cpu', 'seed': SEED,
              'sources': sources, 'cases': records,
              'policy': 'controlled offline examples; new inputs; retained weights; fixed masks; no training; original test metrics unchanged'}
    (output / f'{model_id}.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-id', required=True, choices=list(EXPECTED))
    parser.add_argument('--project', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    run(args.model_id, args.project, args.output)
