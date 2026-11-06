"""Install and verify the wind source package, preserving converter assets."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
import pandas as pd
from evaluation_policy import POLICY

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'data/reference/wind'
PUBLIC = ROOT / 'public/data/wind'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(package):
    package = Path(package)
    complete = json.loads((package/'complete.json').read_text())
    REFERENCE.mkdir(parents=True,exist_ok=True)
    PUBLIC.mkdir(parents=True,exist_ok=True)
    source_records = json.loads((package/'sources.json').read_text())
    retained = json.loads((ROOT/'data/manifest.json').read_text(encoding='utf-8-sig'))
    existing = {r['local']:r for r in retained}
    for record in source_records:
        path = package / record['file']
        assert path.stat().st_size == record['bytes'] and digest(path) == record['sha256']
        relative = 'data/models/wind/method2.ckpt' if record['file']=='model.ckpt' else 'data/source/wind/'+record['file'].removeprefix('sources/')
        target = ROOT/relative; target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(path,target)
        existing[relative] = dict(local=relative,remote=record['remote'],bytes=record['bytes'],sha256=record['sha256'])
    (ROOT/'data/manifest.json').write_text(json.dumps(list(existing.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    source = ROOT/'data/source/wind'
    df = pd.read_csv(source/'weather/extracted_data.csv')
    feature_env = {}
    for node in ast.parse((source/'weather/1.py').read_text()).body:
        if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in
            ['weather_actual','weather_forecast','features_actual_and_forecast'] for t in node.targets):
            exec(compile(ast.Module(body=[node],type_ignores=[]),'features','exec'),feature_env)
    keys = feature_env['features_actual_and_forecast']
    raw_train = np.load(source/'data/xuji_28/train.npy').astype(float)
    raw_test = np.load(source/'data/xuji_28/test.npy').astype(float)
    train = np.load(source/'processed/xuji_28/train.npy')
    clean = np.load(source/'processed/xuji_28/test.npy')
    x = np.load(source/'insertedData/xuji_28/test.npy')
    labels = np.load(source/'insertedData/xuji_28/labels.npy')
    np.testing.assert_array_equal(np.concatenate([raw_train,raw_test]),df[keys].to_numpy(dtype=np.float32).astype(float))
    lo,hi=raw_train.min(0),raw_train.max(0)
    np.testing.assert_array_equal((raw_train-lo)/(hi-lo+1e-4),train)
    np.testing.assert_array_equal((raw_test-lo)/(hi-lo+1e-4),clean)
    times=pd.to_datetime(df.forecastvaluetime)
    assert times.diff().dropna().eq(pd.Timedelta(minutes=15)).all()
    assert not times.duplicated().any() and df[keys].isna().sum().sum()==0
    all_times=times.dt.strftime('%Y-%m-%d %H:%M').tolist()
    split=len(train);test_times=all_times[split:]
    def asset(name,value):
        a=np.asarray(value,dtype='<f8');p=REFERENCE/name;p.write_bytes(a.tobytes())
        return dict(file=name,shape=list(a.shape),bytes=p.stat().st_size,sha256=digest(p))
    train_asset=asset('train.bin',raw_train)
    train_asset.update(keys=keys,times=all_times[:split])
    input_asset=asset('input.bin',x)
    clean_asset=asset('clean-test.bin',clean)
    label_asset=asset('labels.bin',labels)
    shutil.copytree(package/'windows-v1',REFERENCE/'windows-v1',dirs_exist_ok=True)
    shutil.copytree(package/'windows-v1/model2',PUBLIC/'windows-v1/model2',dirs_exist_ok=True)
    # Continuous recon/errors are retained references; public curves are column exports.
    for name in ['recon.bin','errors.bin']:(PUBLIC/'windows-v1/model2'/name).unlink(missing_ok=True)
    model=json.loads((package/'model.json').read_text())
    (REFERENCE/'windows-v1/model2/source-manifest.json').write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf8')
    (REFERENCE/'cases').mkdir(exist_ok=True)
    shutil.copy2(package/'cases.json',REFERENCE/'cases/model2.json')
    names={'temperature':'温度','humidity':'湿度','pressure':'气压'}
    for height in ['10','30','50','70','hub']:
        height_label='轮毂高度' if height=='hub' else height+'米'
        names['ws_'+height]=height_label+'风速';names['wd_'+height]=height_label+'风向'
    features=[]
    for i,key in enumerate(keys):
        if key=='actualvalue':label,group='实际功率','实测功率'
        elif key=='forecastvalue':label,group='预测功率','预测功率'
        else:
            actual=key.startswith('weather_');base=key.split('_',1)[1]
            label=('实测' if actual else '预测')+names[base];group='实测天气' if actual else '预测天气'
        features.append(dict(index=i,key=key,label=label,description=label,group=group))
    manifest=dict(schemaVersion=2,resultVersion=complete['version'],window=64,
        dataset=dict(id='wind',title='风电设备',sourceDate='2026-10-27',samplingMinutes=15,
            sourceFiles=['all_short.csv','all_weather.csv','all_weather_forecast.csv'],unmatchedRows=0,missingValues=0,
            labelCells=int(labels.sum()),outsideUnitRange=int(((clean<0)|(clean>1)).sum())),
        normalization=dict(epsilon=1e-4,clip=False),features=features,times=test_times,labels=labels.any(1).astype(int).tolist(),
        input=input_asset,cleanTest=clean_asset,labelMatrix=label_asset,datasets={'train':train_asset},models=[model],
        removedFeatures=[],summary=dict(rawRows=len(df),rawFeatures=28,emptyFeatures=0,emptyRows=0,cleanRows=len(df),features=28,
            trainRows=split,testRows=len(x),anomalousRows=int(labels.any(1).sum()),
            trainStart=all_times[0],trainEnd=all_times[split-1],testStart=test_times[0],testEnd=test_times[-1],
            omittedTimes=[],cleanStart=all_times[0],cleanEnd=all_times[-1]),
        assets=[input_asset,clean_asset,label_asset,model['recon'],model['errors']],
        evaluation={**POLICY,'date':'2026-11-05','inferenceVersion':complete['version']},
        provenance=dict(checkpoint='2026-10-27; 5 main-training epochs',
            source='station 41; 8759 selected power and weather rows; exact float32 raw arrays',
            inference='2026-11-05 CPU export; retained weights; fixed saved masks; not a restoration of historical random inference',
            thresholds='Same retrospective policy as converter; sequence and independent windows evaluated separately'))
    (REFERENCE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,allow_nan=False),encoding='utf8')
    evaluation=dict(version=manifest['resultVersion'],policy=POLICY,models=[{'id':'model2',**{k:model['evaluation'][k] for k in ['sequence','window']}}])
    (PUBLIC/'evaluation.json').write_text(json.dumps(evaluation,ensure_ascii=False,indent=2),encoding='utf8')
    reference_index={p.relative_to(REFERENCE).as_posix():digest(p) for p in sorted(REFERENCE.rglob('*')) if p.is_file()}
    (ROOT/'data/wind-reference-index.json').write_text(json.dumps(reference_index,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'installed':complete['version'],'windows':model['windows']['count'],'sources':len(source_records),'metrics':model['metrics']},ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('package');main(parser.parse_args().package)
