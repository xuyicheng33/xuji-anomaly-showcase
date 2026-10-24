from pathlib import Path
import json
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/"web/public/data"

def dataset_arrays(dataset):
    if dataset=="converter":
        base=ROOT/"data/source/dataset/prodata"
        return np.load(base/"converter_train.npy"),np.load(base/"converter_test.npy"),np.zeros((2397,125),np.uint8)
    base=ROOT/"data/source/data/xuji"
    return np.load(base/"train.npy"),np.load(base/"test.npy"),np.load(base/"labels.npy")

def save_experiment(dataset,experiment_id,raw,recon,labels,threshold,description,model_id,history=None,source="本地计算",score=None,per_feature=None,extra=None):
    from .analytics import metrics
    target=PUBLIC/dataset/experiment_id;target.mkdir(parents=True,exist_ok=True)
    y=labels.max(axis=1) if labels.ndim==2 else labels
    err=(raw-recon)**2 if per_feature is None else per_feature
    scores=err.mean(axis=1) if score is None else score
    arrays={"raw":(raw,"float32"),"recon":(recon,"float32"),"errors":(err,"float32"),"scores":(scores,"float64"),
            "labels":(y,"uint8"),"matrix":(labels if labels.ndim==2 else np.tile(y[:,None],(1,raw.shape[1])),"uint8")}
    files={}
    for key,(a,dtype) in arrays.items():
        np.asarray(a,dtype=dtype).tofile(target/(key+".bin"))
        files[key]={"url":"/data/"+dataset+"/"+experiment_id+"/"+key+".bin","dtype":dtype,"shape":list(a.shape)}
    meta=dict(id=experiment_id,dataset=dataset,model=model_id,name=description,source=source,threshold=float(threshold),
              thresholdSource="训练分数99%分位数",window=64,history=history or [],files=files,metrics=metrics(y,scores,threshold))
    if extra:meta.update(extra)
    (target/"meta.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    return meta

def catalog():
    return json.loads((PUBLIC/"catalog.json").read_text(encoding="utf-8"))

def register(meta):
    cat=catalog();cat["datasets"][meta["dataset"]]["experiments"].append(meta)
    (PUBLIC/"catalog.json").write_text(json.dumps(cat,ensure_ascii=False,indent=2),encoding="utf-8")

