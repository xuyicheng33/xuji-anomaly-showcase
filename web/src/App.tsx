import {useEffect,useState} from 'react';
import {Activity,ArrowLeft,ArrowRight,ChevronDown,Check,Database,Workflow,Radio,RefreshCw} from 'lucide-react';
import type {Arrays,Catalog,DatasetId,ModelId} from './types';
import {api,arraysFor} from './data';
import {Stages} from './Stages';
import {Detection} from './Detection';
const STEPS=['技术路线','数据概况','原始测点','清洗处理','时间划分','模型输入','异常构造','模型结构','训练与保存','动态检测'];
function initial(){try{return JSON.parse(localStorage.getItem('xuji-session')||'{}');}catch{return {};}}
const saved=initial();
export default function App(){
 const[cat,setCat]=useState<Catalog>();const[error,setError]=useState('');const[loading,setLoading]=useState(false);
 const[dataset,setDataset]=useState<DatasetId>(saved.dataset==='xuji'?'xuji':'converter');
 const[model,setModel]=useState<ModelId>(['model1','model2','model3'].includes(saved.model)?saved.model:'model1');
 const[step,setStep]=useState<number>(()=>{const q=new URLSearchParams(location.search).get('step');return q?Math.min(10,Math.max(1,Number(q))):saved.step||1;});
 const[experiment,setExperiment]=useState('');const[arrays,setArrays]=useState<Arrays>();const[menu,setMenu]=useState(false);
 const reload=()=>api<Catalog>('/catalog').then(setCat).catch(e=>setError(e.message));
 useEffect(()=>{void reload();},[]);
 const ds=cat?.datasets[dataset];const options=ds?.experiments.filter(e=>e.model===model)||[];
 const exp=options.find(e=>e.id===experiment)||options[0];
 useEffect(()=>{if(!exp){setArrays(undefined);return;}let live=true;setLoading(true);setError('');setArrays(undefined);
  arraysFor(exp).then(a=>{if(live)setArrays(a);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[dataset,exp?.id]);
 useEffect(()=>{localStorage.setItem('xuji-session',JSON.stringify({dataset,model,step}));},[dataset,model,step]);
 useEffect(()=>{const cb=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT'].includes(t.tagName)||t.isContentEditable)return;
 if(e.key==='ArrowRight')setStep(s=>Math.min(10,s+1));if(e.key==='ArrowLeft')setStep(s=>Math.max(1,s-1));};window.addEventListener('keydown',cb);return()=>window.removeEventListener('keydown',cb);},[]);
 const goto=(s:number)=>{setStep(s);setMenu(false);window.scrollTo({top:0,behavior:'instant'});};
 if(!ds)return <div className="initial-screen"><Activity size={32}/><h2>正在载入研究成果</h2><p>{error||'读取数据目录与实验版本…'}</p>{error&&<button onClick={reload}>重新连接</button>}</div>;
 return <div className="app-shell">
  <header className="topbar"><a href="#" className="brand" onClick={e=>{e.preventDefault();goto(1);}}><span className="brand-icon"><Activity size={22}/></span><span><strong>许继电气</strong><small>异常检测探索</small></span></a>
   <div className="dataset-switch" role="group" aria-label="选择数据集"><span className={'switch-plate '+(dataset==='xuji'?'right':'')}/>{(['converter','xuji'] as DatasetId[]).map(id=><button key={id} className={dataset===id?'active':''} onClick={()=>{setDataset(id);setExperiment('');}}>{id==='converter'?<Database size={15}/>:<Workflow size={15}/>} {cat!.datasets[id].short}</button>)}</div>
   <div className="header-right"><span className="local-state"><i/>本机运行</span><button className="outline compact" onClick={()=>setMenu(!menu)} aria-expanded={menu}>步骤 {String(step).padStart(2,'0')} / 10 <ChevronDown size={15}/></button></div>
  </header>
  <nav className="step-strip" aria-label="处理流程">{STEPS.map((s,i)=><button key={s} onClick={()=>goto(i+1)} className={step===i+1?'active':step>i+1?'complete':''}><span>{step>i+1?<Check size={12}/>:String(i+1).padStart(2,'0')}</span>{s}</button>)}</nav>
  {menu&&<div className="nav-menu">{STEPS.map((s,i)=><button key={s} onClick={()=>goto(i+1)}>{String(i+1).padStart(2,'0')} {s}</button>)}</div>}
  <main>
   <div className="context-line"><span>{ds.name}</span><span className="context-divider"/> <span>{ds.features} 个变量</span><span className="context-divider"/><span>{ds.sampling}</span>
   <div className="context-selects"><select aria-label="选择检测模型" value={model} onChange={e=>{setModel(e.target.value as ModelId);setExperiment('');}}>{ds.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
   <select aria-label="选择实验版本" value={exp?.id||''} onChange={e=>setExperiment(e.target.value)}>{options.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div></div>
   {error&&<div className="error-message" role="alert">{error}<button onClick={reload}><RefreshCw size={14}/>重新读取</button></div>}
   <div className="stage" key={dataset+'-'+step}>
    {step===10&&exp&&arrays?<Detection key={dataset+exp.id} dataset={dataset} ds={ds} exp={exp} arrays={arrays}/>:step===10?<div className="loading-panel"><Radio className="pulse"/>{loading?'正在加载检测序列…':'当前实验没有检测序列'}</div>:<Stages step={step} dataset={dataset} ds={ds} cat={cat!} exp={exp} arrays={arrays} model={model} onModel={m=>{setModel(m);setExperiment('');}} goto={goto} refresh={reload} selectExperiment={id=>{setExperiment(id);goto(10);}}/>}
   </div>
  </main>
  <footer className="footer-controls"><button className="outline" disabled={step===1} onClick={()=>goto(step-1)}><ArrowLeft size={16}/>上一步</button><div className="footer-position"><span className="mono">{String(step).padStart(2,'0')}</span><span>{STEPS[step-1]}</span><div className="footer-dots">{STEPS.map((s,i)=><button aria-label={'前往'+s} title={s} key={s} className={i+1===step?'active':''} onClick={()=>goto(i+1)}/>)}</div></div><button className="primary" disabled={step===10} onClick={()=>goto(step+1)}>下一步<ArrowRight size={16}/></button></footer>
 </div>;
}

