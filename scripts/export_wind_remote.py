"""Export retained wind method 2 on CPU to a new, separate website package.

No training or research-file edits. Predictions are stored before deriving scores.
The package uses the same retrospective evaluation as the converter website.
"""
import argparse
import ast
import contextlib
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import time

import numpy as np
import torch
from evaluation_policy import POLICY, select_threshold, counts
from export_anomaly_cases import construct

CHECKPOINT = '7a4abd770a61714810610b0e88833a2469111efbc9b84eb70cd724686093b9cd'
VERSION = 'wind28-method2-20261105'
SEED = 20261105


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(project, output):
    project, output = Path(project).resolve(), Path(output).resolve()
    if output.is_relative_to(project):
        raise ValueError('Export must be outside the research project')
    output.mkdir(parents=True, exist_ok=False)
    checkpoint = project / 'checkpoints/DTAAD_xuji_28/model.ckpt'
    assert sha(checkpoint) == CHECKPOINT
    torch.set_num_threads(2)
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype,
        type(np.dtype(np.float64)), type(np.dtype(np.float32))])
    ckpt = torch.load(checkpoint, map_location='cpu', weights_only=True)
    sys.path.insert(0, str(project))
    sys.argv = ['export', '--dataset', 'xuji_28', '--model', 'DTAAD', '--Device', 'cpu']
    from src.models import DTAAD
    model = DTAAD(28).double().cpu().eval()
    model.load_state_dict(ckpt['model_state_dict'], strict=True)
    model.save_attn = False
    train = np.load(project / 'processed/xuji_28/train.npy')
    raw = np.load(project / 'insertedData/xuji_28/test.npy')
    label_matrix = np.load(project / 'insertedData/xuji_28/labels.npy')
    labels = label_matrix.any(1)
    features, window = raw.shape[1], model.n_window
    assert features == 28 and window == 64
    tree = ast.parse((project / 'newMain17.py').read_text())
    functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)
                 and n.name in ['compute_spatial_mask', 'compute_global_spatial_mask']]
    env = {'torch': torch}
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'spatial-mask', 'exec'), env)
    spatial_mask = env['compute_global_spatial_mask'](torch.from_numpy(train))

    def infer(x, masked):
        with torch.no_grad(), contextlib.redirect_stdout(io.StringIO()):
            pred = model(torch.from_numpy(x), torch.from_numpy(masked), spatial_mask)
        return pred.numpy()

    def write(relative, values, dtype):
        array = np.asarray(values, dtype=dtype)
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(array.tobytes())
        return dict(file=relative, shape=list(array.shape), bytes=path.stat().st_size, sha256=sha(path))

    n = len(raw) - window + 1
    total = np.zeros_like(raw)
    loss = np.zeros_like(raw)
    coverage = np.zeros(len(raw), int)
    scores = np.empty((n, window))
    chunks, probes = [], []
    started = time.time()
    for begin in range(0, n, 32):
        end = min(begin + 32, n)
        x = np.stack([raw[i:i+window] for i in range(begin, end)])
        masks = np.ones_like(x, dtype=np.uint8)
        for local, start in enumerate(range(begin, end)):
            rng = np.random.default_rng(SEED + start + 200000)
            for f, offset in enumerate(rng.integers(0, 49, features)):
                masks[local, offset:offset+16, f] = 0
        original_prediction = infer(x, x * masks)
        pred = original_prediction.astype('<f4')
        errors = (x - pred.astype(float)) ** 2
        assert np.isfinite(pred).all() and np.isfinite(errors).all()
        for j, index in enumerate(range(begin, end)):
            total[index:index+window] += pred[j]
            loss[index:index+window] += errors[j]
            coverage[index:index+window] += 1
            scores[index] = errors[j].mean(1)
        asset = write(f'windows-v1/model2/windows-{begin:04d}.bin', pred, '<f4')
        chunks.append({k:v for k,v in asset.items() if k != 'shape'} | {'start':begin, 'count':end-begin})
        write(f'windows-v1/masks/windows-{begin:04d}.bin', masks, 'uint8')
        if begin in (0, 1280, 2560):
            single = infer(x[:1], (x*masks)[:1])
            repeat = infer(x[:1], (x*masks)[:1])
            probe = dict(start=begin, repeatMaxDifference=float(np.max(abs(single-repeat))),
                         batchVsSingleMaxDifference=float(np.max(abs(single-original_prediction[:1]))))
            assert probe['repeatMaxDifference'] == 0 and probe['batchVsSingleMaxDifference'] < 1e-12
            probes.append(probe)
        if begin % 512 == 0:
            print(json.dumps({'windows':end,'total':n,'seconds':round(time.time()-started)}), flush=True)
    recon = write('windows-v1/model2/recon.bin', total / coverage[:,None], '<f8')
    errors = write('windows-v1/model2/errors.bin', loss / coverage[:,None], '<f8')
    sequence_scores = (loss / coverage[:,None]).mean(1)
    sequence_eval = select_threshold(sequence_scores, labels)
    window_eval = select_threshold(scores, np.stack([labels[i:i+window] for i in range(n)]))
    predicted = sequence_scores > sequence_eval['value']
    adjusted = predicted.copy()
    for a,b in np.flatnonzero(np.diff(np.r_[0,labels,0])).reshape(-1,2):
        if adjusted[a:b].any(): adjusted[a:b] = True
    from sklearn.metrics import roc_auc_score
    examples = []
    for code in ['tp','fn','fp','tn']:
        found = None
        for start in range(n):
            result = scores[start] > window_eval['value']
            hits = np.flatnonzero((labels[start:start+window] == (code in ('tp','fn'))) &
                                 (result == (code in ('tp','fp'))))
            if len(hits):
                point = int(hits[0]); index = start + point
                found = dict(code=code, index=index, start=start, feature=int((loss[index]/coverage[index]).argmax()))
                break
        if found: examples.append(found)
    model_record = dict(id='model2', name='方法二', run=VERSION, inferenceRun=VERSION,
        history=[dict(epoch=i+1,loss=float(v[0]),lr=float(v[1])) for i,v in enumerate(ckpt['accuracy_list'])],
        threshold=sequence_eval['value'], windowThreshold=window_eval['value'], scores=sequence_scores.tolist(),
        recon=recon, errors=errors, coverage=coverage.tolist(),
        metrics=dict(point_wise=counts(labels,predicted),point_adjusted=counts(labels,adjusted),
                     continuous_score_auc=float(roc_auc_score(labels,sequence_scores))),
        evaluation=dict(policy=POLICY['id'],sequence=sequence_eval,window=window_eval),
        windows=dict(chunks=chunks,count=n,dtype='float32',maskDirectory='windows-v1/masks',
                     maskPolicy=dict(seed=SEED,zeroSpan=16,perFeature=True,key='split+windowStart',dtype='uint8')),
        examples=examples, provenance=dict(probes=probes,checkpointSHA256=CHECKPOINT,
            inputPolicy='retained normalized injected test; all complete windows; source-index overlap averaging',
            predictionDtype='float32',aggregationDtype='float64'))
    (output/'model.json').write_text(json.dumps(model_record,ensure_ascii=False,allow_nan=False),encoding='utf8')

    # Same four constructions and two compositions as the existing website.
    clean = np.load(project/'processed/xuji_28/test.npy')
    cases = construct(clean, list(range(features)))
    for c in cases:
        c['source']['file'] = 'processed/xuji_28/test.npy'
        prediction = infer(c['input'][None], (c['input']*c['mask'])[None])[0].astype('<f4')
        c.update(recon=prediction, errors=(c['input']-prediction.astype(float))**2)
        c['scores'] = c['errors'].mean(1)
        for k,v in list(c.items()):
            if isinstance(v,np.ndarray):c[k]=v.tolist()
    (output/'cases.json').write_text(json.dumps(dict(version=VERSION,model='model2',device='cpu',seed=20261028,
        cases=cases,sources={str(checkpoint):CHECKPOINT},policy='controlled new wind cases; retained weights; fixed masks; no training'),
        ensure_ascii=False,allow_nan=False),encoding='utf8')
    sources = []
    paths = ['data/xuji_28/train.npy','data/xuji_28/test.npy','data/xuji_28/labels.npy',
        'processed/xuji_28/train.npy','processed/xuji_28/test.npy','processed/xuji_28/labels.npy',
        'insertedData/xuji_28/test.npy','insertedData/xuji_28/labels.npy',
        'reconstructed/epochtest_fusion.npy','newMain17.py','preprocess.py','demo11.py','demoNew03.py','adaptive_mask.py']
    paths += [str(p.relative_to(project)) for p in (project/'src').glob('*.py')]
    paths += [str(p.relative_to(project)) for p in (project/'logs').glob('xuji_28*')]
    for rel in paths:
        src=project/rel; dst=output/'sources'/rel; dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
        sources.append(dict(file=dst.relative_to(output).as_posix(),remote=str(src),sha256=sha(src),bytes=src.stat().st_size))
    for rel in ['extracted_data.csv','1.py']:
        src=project.parents[1]/'other/data/weather_forecast'/rel
        dst=output/'sources/weather'/rel;dst.parent.mkdir(exist_ok=True);shutil.copy2(src,dst)
        sources.append(dict(file=dst.relative_to(output).as_posix(),remote=str(src),sha256=sha(src),bytes=src.stat().st_size))
    shutil.copy2(checkpoint,output/'model.ckpt')
    sources.append(dict(file='model.ckpt',remote=str(checkpoint),sha256=CHECKPOINT,bytes=checkpoint.stat().st_size))
    (output/'sources.json').write_text(json.dumps(sources,indent=2),encoding='utf8')
    (output/'complete.json').write_text(json.dumps(dict(version=VERSION,windows=n,cases=len(cases),seconds=round(time.time()-started))),encoding='utf8')
    print(json.dumps({'complete':VERSION,'windows':n,'metrics':model_record['metrics']}),flush=True)


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();run(a.project,a.output)
