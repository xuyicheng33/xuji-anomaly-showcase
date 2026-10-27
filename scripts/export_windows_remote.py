"""Build a separate, deterministic static result package with retained weights.

Runs in /root/DTAADENV. Never overwrites research archives. Each valid window is
indexed by its first source row. Masks are fixed per source/window and saved.
"""
import argparse
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import random
import sys
import time

import numpy as np
import torch


def metrics(y, prediction):
    y, p = np.asarray(y, bool), np.asarray(prediction, bool)
    tp, fp, fn, tn = (int((y & p).sum()), int((~y & p).sum()), int((y & ~p).sum()), int((~y & ~p).sum()))
    return dict(tp=tp, fp=fp, fn=fn, tn=tn, precision=tp/(tp+fp) if tp+fp else None,
                recall=tp/(tp+fn) if tp+fn else None, f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None)


def adjusted(y, p):
    p = np.asarray(p, bool).copy()
    bounds = np.flatnonzero(np.diff(np.r_[0, np.asarray(y, int), 0]))
    for a, b in bounds.reshape(-1, 2):
        if p[a:b].any():
            p[a:b] = True
    return p


def mask_for(start, split, seed=20261027):
    # The retained mask code uses a 16-step zero span for 64-step FFT windows.
    # Persist its realization; derive random choices from the window, never the batch.
    rng = np.random.default_rng(seed + start + (100000 if split == 'train' else 200000))
    offsets = rng.integers(0, 49, 125)
    mask = np.ones((64, 125), dtype=np.uint8)
    for c, begin in enumerate(offsets):
        mask[begin:begin+16, c] = 0
    return mask


def calibrate(scores):
    from src.spot import SPOT
    values = np.asarray(scores).reshape(-1)
    # Only training scores participate. No test labels and no threshold search.
    with contextlib.redirect_stdout(io.StringIO()):
        spot = SPOT(1e-5)
        spot.fit(values, np.empty(0))
        spot.initialize(level=.99, min_extrema=False, verbose=False)
    threshold = float(spot.extreme_quantile)
    if not np.isfinite(threshold) or threshold <= 0:
        raise ValueError('POT produced an invalid threshold')
    return {'value': threshold, 'method':'POT / SPOT', 'q':1e-5, 'level':.99,
            'sampleCount':len(values), 'initialThreshold':float(spot.init_threshold), 'peaks':int(spot.Nt)}


def run(model_id, project, output, batch_size):
    project, output = Path(project), Path(output)
    output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    torch.manual_seed(20261027)
    np.random.seed(20261027)
    random.seed(20261027)
    sys.path.insert(0, str(project))
    sys.argv = ['export', '--dataset','converter','--model','DTAAD','--Device','cuda']
    from src.models import DTAAD
    model = DTAAD(125).double()
    ckpt_path = project/'checkpoints/DTAAD_converter/model.ckpt'
    ckpt = torch.load(ckpt_path, map_location='cpu', weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'], strict=True)
    model = model.cuda().eval()
    if hasattr(model, 'save_attn'):
        model.save_attn = False
    arrays = {s:np.load(project/f'processed/converter/converter_{s}.npy') for s in ['train','test']}
    label_matrix = np.load(project/'processed/converter/converter_labels.npy').astype(np.uint8)
    labels = label_matrix.any(1).astype(np.uint8)
    model_out = output/model_id
    model_out.mkdir(exist_ok=True)
    sources = {}
    for p in [ckpt_path, project/'src/models.py', project/'adaptive_mask.py']:
        sources[str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
    split_results = {}
    model_chunks = []
    single_train = []
    started = time.time()
    for split, raw in arrays.items():
        n = len(raw)-63
        recon_sum = np.zeros_like(raw)
        error_sum = np.zeros_like(raw)
        coverage = np.zeros(len(raw), np.int32)
        probe = None
        for begin in range(0, n, batch_size):
            end = min(n, begin+batch_size)
            source = np.stack([raw[i:i+64] for i in range(begin,end)])
            masks = np.stack([mask_for(i,split) for i in range(begin,end)])
            d = torch.from_numpy(source).cuda()
            dm = torch.from_numpy(source*masks).cuda()
            with torch.inference_mode():
                pred = model(d.permute(0,2,1), dm.permute(0,2,1)) if model_id=='model1' else model(d,dm)
            pred = pred.cpu().numpy().astype('<f4')
            errors = (source-pred.astype(float))**2
            for local, i in enumerate(range(begin,end)):
                recon_sum[i:i+64] += pred[local]
                error_sum[i:i+64] += errors[local]
                coverage[i:i+64] += 1
            if split=='train':
                single_train.append(errors.mean(2).ravel())
            else:
                file = model_out/f'windows-{begin:04d}.bin'
                file.write_bytes(pred.tobytes())
                model_chunks.append({'start':begin,'count':end-begin,'file':f'windows-v1/{model_id}/{file.name}',
                    'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
                mask_dir = output/'masks'
                mask_dir.mkdir(exist_ok=True)
                mask_file = mask_dir/f'windows-{begin:04d}.bin'
                if not mask_file.exists():
                    mask_file.write_bytes(masks.tobytes())
                else:
                    assert mask_file.read_bytes()==masks.tobytes()
                if begin==0:
                    with torch.inference_mode():
                        ds, ms = d[:1], dm[:1]
                        p1 = model(ds.permute(0,2,1),ms.permute(0,2,1)) if model_id=='model1' else model(ds,ms)
                        p2 = model(ds.permute(0,2,1),ms.permute(0,2,1)) if model_id=='model1' else model(ds,ms)
                    probe = {'repeatMaxDifference':float((p1-p2).abs().max()),
                        'batchVsSingleMaxDifference':float(np.abs(pred[:1]-p1.cpu().numpy()).max())}
            if begin % (batch_size*20)==0:
                print(json.dumps({'model':model_id,'split':split,'windows':end,'total':n,'seconds':round(time.time()-started)}),flush=True)
        assert (coverage>0).all()
        split_results[split] = {'recon':recon_sum/coverage[:,None], 'errors':error_sum/coverage[:,None], 'coverage':coverage}
        if probe:
            split_results[split]['probe']=probe
    whole_calibration = calibrate(split_results['train']['errors'].mean(1))
    window_calibration = calibrate(np.concatenate(single_train))
    test = split_results['test']
    score = test['errors'].mean(1)
    threshold = whole_calibration['value']
    from sklearn.metrics import roc_auc_score
    assets = {}
    for name, a in [('recon',test['recon']),('errors',test['errors'])]:
        f = model_out/(name+'.bin')
        f.write_bytes(np.asarray(a,dtype='<f8').tobytes())
        assets[name]={'file':f'windows-v1/{model_id}/{f.name}','shape':list(a.shape),'bytes':f.stat().st_size,
                     'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
    result = {'id':model_id, 'run':'windows-v1-20261027', 'window':64, 'stride':1,
        'windowCount':len(arrays['test'])-63, 'chunks':model_chunks, 'coverage':test['coverage'].tolist(),
        'scores':score.tolist(), 'threshold':threshold,'windowThreshold':window_calibration['value'],
        'calibration':{'sequence':whole_calibration,'window':window_calibration},
        'thresholdSource':'训练输入的重建误差经POT拟合；初始分位0.99，风险参数0.00001',
        'metrics':{'point_wise':metrics(labels,score>threshold),'point_adjusted':metrics(labels,adjusted(labels,score>threshold)),
                   'continuous_score_auc':float(roc_auc_score(labels,score))},
        **assets, 'sources':sources, 'probe':test['probe'],
        'maskPolicy':{'seed':20261027,'zeroSpan':16,'perFeature':True,'key':'split+windowStart','dtype':'uint8'},
        'inputPolicy':'retained normalized arrays; no padding; all complete 64-row windows; correct source-index overlap averaging',
        'predictionDtype':'float32','aggregationDtype':'float64','elapsedSeconds':round(time.time()-started)}
    (model_out/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'completed':model_id,'elapsedSeconds':result['elapsedSeconds'],'threshold':threshold,
        'windowThreshold':result['windowThreshold'],'metrics':result['metrics'],'probe':result['probe']}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--model-id',required=True)
    parser.add_argument('--project',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--batch-size',type=int,default=32)
    args=parser.parse_args()
    run(args.model_id,args.project,args.output,args.batch_size)
