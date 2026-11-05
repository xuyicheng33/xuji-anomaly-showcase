"""Validate every window, its mask and all overlap-averaged numerical results."""
import hashlib,json
from pathlib import Path
import numpy as np
from evaluation_policy import POLICY, select_threshold
from dataset_paths import selected_paths
from data_geometry import geometry

root=Path(__file__).resolve().parents[1]
reference,folder=selected_paths()
data=json.loads((reference/'manifest.json').read_text('utf8'))
_,features,window=geometry(data)
raw=np.fromfile(reference/data['input']['file'],dtype='<f8').reshape(-1,features)
labels=np.fromfile(reference/data['labelMatrix']['file'],dtype='<f8').reshape(-1,features)
assert np.array_equal(labels.any(1),data['labels'])
assert len(data['models'])>=1
assert data['evaluation']['id']==POLICY['id']
for m in data['models']:
    total=np.zeros_like(raw);loss=np.zeros_like(raw);count=np.zeros(len(raw),int);next_start=0;window_scores=[]
    for chunk in m['windows']['chunks']:
        assert chunk['start']==next_start
        p=folder/chunk['file'];b=p.read_bytes()
        assert len(b)==chunk['bytes'] and hashlib.sha256(b).hexdigest()==chunk['sha256']
        preds=np.frombuffer(b,dtype='<f4').reshape(chunk['count'],window,features)
        masks=np.fromfile(reference/m['windows']['maskDirectory']/p.name,dtype=np.uint8).reshape(chunk['count'],window,features)
        assert np.isfinite(preds).all() and np.isin(masks,[0,1]).all()
        assert (masks.sum(1)==window-m['windows']['maskPolicy']['zeroSpan']).all()
        for j,pred in enumerate(preds):
            i=chunk['start']+j
            total[i:i+window]+=pred
            loss[i:i+window]+=(raw[i:i+window]-pred.astype(float))**2
            window_scores.append(((raw[i:i+window]-pred.astype(float))**2).mean(1))
            count[i:i+window]+=1
        next_start+=chunk['count']
    assert next_start==len(raw)-window+1
    assert count[0]==count[-1]==1 and count[window-1]==count[-window]==window and (count>0).all()
    np.testing.assert_array_equal(count,m['coverage'])
    recon=np.fromfile(reference/m['recon']['file'],dtype='<f8').reshape(-1,features)
    errors=np.fromfile(reference/m['errors']['file'],dtype='<f8').reshape(-1,features)
    np.testing.assert_array_equal(total/count[:,None],recon)
    np.testing.assert_array_equal(loss/count[:,None],errors)
    np.testing.assert_allclose(errors.mean(1),m['scores'],rtol=0,atol=1e-15)
    assert m['run']==data['resultVersion'] and 'potThreshold' not in m
    sequence=select_threshold(m['scores'],data['labels'])
    window_evaluation=select_threshold(np.asarray(window_scores),np.asarray([data['labels'][i:i+window] for i in range(next_start)]))
    assert sequence==m['evaluation']['sequence'] and window_evaluation==m['evaluation']['window']
    assert m['threshold']==sequence['value'] and m['windowThreshold']==window_evaluation['value']
    print('PASS',m['name'],next_start,'windows; masks, source alignment, both edges, mean reconstruction and mean squared error')
print('PASS all models complete and numerically consistent')
