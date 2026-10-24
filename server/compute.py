import time,uuid,threading,traceback
import numpy as np
import torch
from .data import ROOT,dataset_arrays,save_experiment,register
from .analytics import inject
from .research import create_model,freeze,predict,memory_state,calibrate_memory,LOCK
JOBS={};RUN_LOCK=threading.Lock()

def score_sequence(model,mid,sequence,batch=16,callback=None):
    w=model.n_window;recon=np.empty_like(sequence,dtype=float)
    for start in range(0,len(sequence),batch):
        end=min(start+batch,len(sequence));obs=[]
        for i in range(start,end):
            x=sequence[max(0,i-w+1):i+1]
            if len(x)<w:x=np.concatenate([np.repeat(x[:1],w-len(x),axis=0),x])
            obs.append(x)
        recon[start:end]=predict(model,mid,np.stack(obs))[:,-1,:]
        if callback:callback(end/len(sequence))
    return recon

def fit(dataset,mid,epochs=1,samples=128,seed=42,kind="mixed",split=None,progress=None,cancel=None):
    train,test,_=dataset_arrays(dataset)
    if split:
        seq=np.concatenate([train,test]);cut=int(len(seq)*split);train,test=seq[:cut],seq[cut:]
    minimum=train.min(0);maximum=train.max(0);scale=np.maximum(maximum-minimum,1e-8)
    train=(train-minimum)/scale;test=(test-minimum)/scale
    torch.manual_seed(seed);model=create_model(mid,train.shape[1]);model.save_attn=False
    model.preprocessing={"method":"训练集min–max","min":minimum.tolist(),"max":maximum.tolist()}
    if mid=="model3":calibrate_memory(model,train)
    optimizer=torch.optim.Adam(model.parameters(),lr=1e-4)
    end_indices=np.linspace(model.n_window,len(train)-1,samples,dtype=int)
    history=[];started=time.time()
    for epoch in range(epochs):
        if cancel and cancel():raise InterruptedError("任务已取消")
        noisy,labels=inject(train,kind,seed+epoch,.4) if mid!="model3" else (train,np.zeros(train.shape,np.uint8))
        losses=[];model.train()
        for module in model.modules():
            if hasattr(module,"phase_type"):module.phase_type="test"
        for start in range(0,len(end_indices),16):
            ix=end_indices[start:start+16]
            x=np.stack([noisy[i-model.n_window+1:i+1] for i in ix])
            y=np.stack([labels[i-model.n_window+1:i+1] for i in ix])
            xt=torch.as_tensor(x,dtype=torch.float64);masked=xt.clone();masked[:,::8,:]=0
            with LOCK:
                optimizer.zero_grad()
                output=model(xt.permute(0,2,1),masked.permute(0,2,1)) if mid=="model1" else model(xt,masked)
                error=(output-xt)**2
                loss=torch.where(torch.as_tensor(y,dtype=torch.bool),torch.relu(.2-error),error).mean() if mid!="model3" else error.mean()
                loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step()
            losses.append(float(loss.detach()))
            if progress:progress((epoch+(start+len(ix))/samples)/epochs*.55)
        history.append(dict(epoch=epoch+1,loss=float(np.mean(losses)),lr=1e-4))
    freeze(model)
    sample_recon=predict(model,mid,np.stack([train[i-model.n_window+1:i+1] for i in end_indices[:64]]))[:,-1]
    threshold=float(np.quantile(((sample_recon-train[end_indices[:64]])**2).mean(1),.99))
    test_injected,matrix=inject(test,kind,seed,.35)
    recon=score_sequence(model,mid,test_injected,callback=lambda p:progress(.55+p*.4) if progress else None)
    return model,test_injected,recon,matrix,threshold,history,time.time()-started,len(train)

def submit(config):
    jid=uuid.uuid4().hex[:12]
    JOBS[jid]=dict(id=jid,status="queued",progress=0,created=time.time(),config=config,cancel=False)
    folder=ROOT/"data/jobs"/jid;folder.mkdir(parents=True,exist_ok=True)
    persist(JOBS[jid])
    threading.Thread(target=run_job,args=(jid,),daemon=True).start()
    return JOBS[jid]

def run_job(jid):
    job=JOBS[jid];cfg=job["config"]
    with RUN_LOCK:
        if job["cancel"]:job["status"]="cancelled";return
        job["status"]="running"
        try:
            model,raw,recon,labels,threshold,history,seconds,train_count=fit(cfg["dataset"],cfg["model"],cfg["epochs"],cfg["samples"],
               cfg["seed"],cfg["kind"],cfg["split"],progress=lambda p:job.update(progress=p),cancel=lambda:job["cancel"])
            if job["cancel"]:raise InterruptedError("任务已取消")
            folder=ROOT/"data/jobs"/jid;folder.mkdir(parents=True,exist_ok=True)
            torch.save(dict(model_state_dict=model.state_dict(),memory_state=memory_state(model),epoch=cfg["epochs"]-1,
                            accuracy_list=[(h["loss"],h["lr"]) for h in history],preprocessing=model.preprocessing),folder/"model.ckpt")
            meta=save_experiment(cfg["dataset"],"job-"+jid,raw,recon,labels,threshold,"本地训练 · "+str(cfg["epochs"])+" 轮",cfg["model"],history,
                    extra=dict(scoreMethod="当前窗口末点误差",hasFeatureLabels=True,trainSamples=cfg["samples"],trainRows=train_count,
                               trainingSeconds=seconds,preprocessing=model.preprocessing,checkpointBytes=(folder/"model.ckpt").stat().st_size,jobId=jid))
            register(meta);job.update(status="complete",progress=1,result=meta);persist(job)
        except InterruptedError:job.update(status="cancelled");persist(job)
        except Exception as e:job.update(status="failed",error=str(e));persist(job);traceback.print_exc()



def persist(job):
    import json
    (ROOT/"data/jobs"/job["id"]/"job.json").write_text(json.dumps(job,ensure_ascii=False,indent=2),encoding="utf-8")

for jobfile in (ROOT/"data/jobs").glob("*/job.json"):
    import json
    saved=json.loads(jobfile.read_text(encoding="utf-8"))
    if saved["status"] in ["running","queued"]:saved.update(status="failed",error="上次运行中断，请重新提交")
    JOBS[saved["id"]]=saved
