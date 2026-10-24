import {useEffect,useMemo,useRef,useState} from 'react';
import {Play,Pause,RotateCcw,SkipBack,SkipForward,Upload,Download,Radio,History,ChevronRight,ArrowUpRight,TriangleAlert} from 'lucide-react';
import type {Arrays,Dataset,DatasetId,Experiment,LivePoint,Metric} from './types';
import {Chart,colors} from './Chart';
import {api,csvRows,fmt,pct,metric} from './data';
import {Title} from './Stages';
type Props={dataset:DatasetId;ds:Dataset;exp:Experiment;arrays:Arrays};
export function Detection({dataset,ds,exp,arrays}:Props){
 const[mode,setMode]=useState<'replay'|'live'>('replay');const[cursor,setCursor]=useState(0);const[playing,setPlaying]=useState(false);
 const[speed,setSpeed]=useState(1);const[feature,setFeature]=useState(dataset==='converter'?4:0);const[scope,setScope]=useState(400);
 const[records,setRecords]=useState<LivePoint[]>([]);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 const[uploaded,setUploaded]=useState<number[][]>();const[filename,setFilename]=useState('');const[fileOpen,setFileOpen]=useState(false);
 const[hover,setHover]=useState<number>();const[generation,setGeneration]=useState(0);
 const token=useRef(0);const upload=useRef<HTMLInputElement>(null);const C=ds.features;
 const T=uploaded?.length||arrays.labels.length;const last=records.at(-1);
 const reset=()=>{token.current++;setPlaying(false);setCursor(0);setRecords([]);setError('');setBusy(false);setGeneration(x=>x+1);};
 const changeMode=(m:'live'|'replay')=>{reset();setMode(m);setUploaded(undefined);setFilename('');};
 const process=async(index:number)=>{
  const ticket=token.current;setBusy(true);setError('');
  const w=exp.window||64;const raw:number[][]=[];
  for(let i=Math.max(0,index-w+1);i<=index;i++)raw.push(uploaded?uploaded[i]:Array.from({length:C},(_,c)=>arrays.raw[i*C+c]));
  while(raw.length<w)raw.unshift(raw[0]);
  try{const point=await api<LivePoint>('/infer',{dataset,model:exp.model,index,window:raw,experiment:exp.id.startsWith('job-')?exp.id:undefined});
   if(ticket===token.current){setRecords(r=>[...r.filter(x=>x.index!==index),point].sort((a,b)=>a.index-b.index));return true;}
  }catch(e){if(ticket===token.current){setError((e as Error).message);setPlaying(false);}}
  finally{if(ticket===token.current)setBusy(false);}
  return false;
 };
 useEffect(()=>{return()=>{token.current++;};},[]);
 useEffect(()=>{
  if(!playing)return;
  if(mode==='replay'){
   const t=setInterval(()=>setCursor(i=>{if(i>=T-1){setPlaying(false);return i;}return i+1;}),Math.max(15,1000/(8*speed)));
   return()=>clearInterval(t);
  }
  let alive=true;const t=setTimeout(()=>{void process(cursor).then(ok=>{if(alive&&ok){if(cursor>=T-1)setPlaying(false);else setCursor(i=>i+1);}});},Math.max(50,500/speed));
  return()=>{alive=false;clearTimeout(t);};
 },[playing,mode,cursor,speed,generation,T]);
 const eventIndices=useMemo(()=>Array.from(arrays.labels,(_,i)=>i).filter(i=>i===0?arrays.scores[i]>exp.threshold:(arrays.scores[i]>exp.threshold)!==(arrays.scores[i-1]>exp.threshold)||arrays.labels[i]!==arrays.labels[i-1]),[arrays,exp]);
 const jump=(direction:number)=>{setPlaying(false);const index=direction>0?eventIndices.find(i=>i>cursor):[...eventIndices].reverse().find(i=>i<cursor);if(index!==undefined)setCursor(index);};
 const recordMap=useMemo(()=>new Map(records.map(r=>[r.index,r])),[records]);
 const stats:Metric=useMemo(()=>{
  if(mode==='replay')return metric(arrays.labels,arrays.scores,exp.threshold,cursor);
  let tp=0,fp=0,fn=0,tn=0;
  for(const r of records){const y=arrays.labels[r.index];if(y){if(r.alarm)tp++;else fn++;}else if(r.alarm)fp++;else tn++;}
  return {tp,fp,fn,tn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
 },[mode,arrays,cursor,records,exp]);
 const currentScore=mode==='replay'?arrays.scores[cursor]:last?.score;
 const threshold=mode==='replay'?exp.threshold:last?.threshold;
 const alarm=currentScore!=null&&threshold!=null&&currentScore>threshold;
 const index=hover??cursor;const selected=ds.dictionary[feature];
 const start=Math.max(0,Math.min(cursor-Math.floor(scope*.55),T-scope));const end=Math.min(T,start+scope);
 const indices=Array.from({length:end-start},(_,i)=>i+start);
 const option=useMemo(()=>{
  const latest=mode==='live'?recordMap.get(cursor):undefined;
  const input=indices.map(i=>uploaded?uploaded[i][feature]:arrays.raw[i*C+feature]);
  const recon=indices.map(i=>mode==='replay'?(i<=cursor?arrays.recon[i*C+feature]:null):recordMap.get(i)?.recon[feature]??null);
  const scores=indices.map(i=>mode==='replay'?(i<=cursor?arrays.scores[i]:null):recordMap.get(i)?.score??null);
  const labs=indices.map(i=>[i,!uploaded&&arrays.labels[i]?1:0]);
  const preds=indices.filter(i=>mode==='replay'?i<=cursor:recordMap.has(i)).map(i=>[i,(mode==='replay'?arrays.scores[i]>exp.threshold:recordMap.get(i)!.alarm)?1:0]);
  const th=mode==='replay'?exp.threshold:last?.threshold;
  const axis={type:'category',boundaryGap:false,data:indices,axisTick:{show:false},axisLine:{lineStyle:{color:'#ddd9cf'}},axisLabel:{color:'#817b70',fontSize:10}};
  return {animation:false,tooltip:{trigger:'axis',confine:true,backgroundColor:'#fff',borderColor:'#e5e2d9',textStyle:{color:'#403c34',fontSize:12}},axisPointer:{link:[{xAxisIndex:'all'}]},
   grid:[{left:67,right:22,top:35,height:125},{left:67,right:22,top:200,height:100},{left:67,right:22,top:337,height:24},{left:67,right:22,top:395,height:24}],
   legend:{top:0,left:62,itemWidth:16,itemHeight:5,textStyle:{fontSize:11,color:'#66635c'},data:['输入','重建','异常分数','阈值']},
   xAxis:[{...axis,gridIndex:0,axisLabel:{show:false}},{...axis,gridIndex:1,axisLabel:{show:false}},{...axis,gridIndex:2,axisLabel:{show:false}},{...axis,gridIndex:3}],
   yAxis:[{type:'value',scale:true,gridIndex:0,splitNumber:3,axisLabel:{color:'#817b70',fontSize:10},splitLine:{lineStyle:{color:'#f1eee7'}}},
    {type:'value',scale:false,gridIndex:1,splitNumber:3,axisLabel:{color:'#817b70',fontSize:10,formatter:(v:number)=>Number(v.toPrecision(2))},splitLine:{lineStyle:{color:'#f1eee7'}}},
    {type:'value',min:0,max:1,gridIndex:2,show:false},{type:'value',min:0,max:1,gridIndex:3,show:false}],
   graphic:[{type:'text',left:14,top:32,style:{text:'波形',fill:'#817b70',fontSize:11}},{type:'text',left:14,top:197,style:{text:'分数',fill:'#817b70',fontSize:11}},{type:'text',left:14,top:340,style:{text:'已知\n标签',fill:'#817b70',fontSize:11,lineHeight:12}},{type:'text',left:14,top:396,style:{text:'系统\n报警',fill:'#817b70',fontSize:11,lineHeight:12}}],
   series:[{name:'输入',type:'line',data:input,showSymbol:false,xAxisIndex:0,yAxisIndex:0,lineStyle:{color:colors.input,width:1.5},itemStyle:{color:colors.input}},
    {name:'重建',type:'line',data:recon,showSymbol:false,xAxisIndex:0,yAxisIndex:0,lineStyle:{color:colors.recon,width:1.6},itemStyle:{color:colors.recon}},
    {name:'异常分数',type:'line',data:scores,showSymbol:false,xAxisIndex:1,yAxisIndex:1,lineStyle:{color:colors.score,width:1.8},itemStyle:{color:colors.score},
     markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:colors.alarm,type:'dashed',width:1},data:th==null?[]:[{yAxis:th}]}},
    {name:'阈值',type:'line',data:indices.map(()=>th??null),xAxisIndex:1,yAxisIndex:1,showSymbol:false,lineStyle:{opacity:0},itemStyle:{color:colors.alarm}},
    {name:'已知构造标签',type:'bar',data:indices.map(i=>uploaded?0:arrays.labels[i]),xAxisIndex:2,yAxisIndex:2,barWidth:'100%',itemStyle:{color:colors.label,opacity:.8}},
    {name:'系统报警',type:'bar',data:indices.map(i=>mode==='replay'?(i<=cursor?Number(arrays.scores[i]>exp.threshold):null):recordMap.has(i)?Number(recordMap.get(i)!.alarm):null),xAxisIndex:3,yAxisIndex:3,barWidth:'100%',itemStyle:{color:colors.alarm}}]};
 },[arrays,feature,cursor,scope,mode,records,uploaded,T,exp]);
 const events=eventIndices.filter(i=>i<=cursor).slice(-6).reverse();
 const parseFile=async(file:File)=>{
  try{if(file.size>20*1024*1024)throw new Error('CSV文件超过20MB');
   const rows=csvRows(await file.text());if(!rows.length)throw new Error('CSV为空');
   const numeric=(r:string[])=>r.every(s=>s!==''&&Number.isFinite(Number(s)));
   let data=rows;if(!numeric(rows[0])){
    const header=rows[0];if(header.length!==C||!header.every((v,i)=>v===ds.dictionary[i].code))throw new Error('表头必须按当前模型的变量编码与顺序排列');
    data=rows.slice(1);
   }
   if(data.length<64)throw new Error('至少需要64行数据');
   if(data.length>10000)throw new Error('最多接受10000行数据');
   if(!data.every(r=>r.length===C&&numeric(r)))throw new Error('每行需要'+C+'个有限数值，不能包含空单元格');
   const numbers=data.map(r=>r.map(Number));if(numbers.some(r=>r.some(v=>Math.abs(v)>100)))throw new Error('请上传训练尺度的归一化数据');
   reset();setMode('live');setUploaded(numbers);setFilename(file.name);setFileOpen(false);
  }catch(e){setError((e as Error).message);}
 };
 const download=()=>{const rows=[ds.dictionary.map(d=>d.code).join(','),...Array.from({length:96},(_,i)=>Array.from({length:C},(_,c)=>arrays.raw[i*C+c]).join(','))].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([rows],{type:'text/csv;charset=utf-8'}));link.download=dataset+'-normalized-window.csv';link.click();URL.revokeObjectURL(link.href);};
 return <><Title title="沿着时间，观察每一次异常判断" description="波形、分数、标签与报警同步推进，检测依据与累计效果在同一处呈现。" right={<span className="badge">{mode==='replay'?'已保存结果回放':'固定模型实时推理'}</span>}/>
 <div className="detection-toolbar"><div className="segmented detection-mode"><button className={mode==='replay'?'active':''} onClick={()=>changeMode('replay')}><History size={15}/>结果回放</button><button className={mode==='live'?'active':''} onClick={()=>changeMode('live')}><Radio size={15}/>实时推理</button></div><div className="toolbar-selects"><select aria-label="检测测点" value={feature} onChange={e=>setFeature(Number(e.target.value))}>{ds.dictionary.map(d=><option value={d.index} key={d.code}>{d.code}</option>)}</select><select aria-label="观察窗口范围" value={scope} onChange={e=>setScope(Number(e.target.value))}>{[200,400,800].map(n=><option key={n} value={n}>{n} 点范围</option>)}</select><button className="outline compact" onClick={()=>setFileOpen(!fileOpen)}><Upload size={15}/>输入数据</button></div></div>
 {fileOpen&&<div className="file-panel"><div><h3>输入训练尺度的数据窗口</h3><p>CSV按测点顺序排列，{C}列、至少64行；使用已经归一化的数据。{exp.model==='model3'?'记忆模型使用本地保存的校准记忆。':''}</p><small>编码顺序：{ds.dictionary.slice(0,4).map(d=>d.code).join('、')}{C>4?'…':''}</small></div><button className="outline" onClick={download}><Download size={15}/>下载兼容片段</button><button className="primary" onClick={()=>upload.current?.click()}><Upload size={15}/>选择CSV</button><input ref={upload} type="file" accept=".csv" hidden onChange={e=>{if(e.target.files?.[0])void parseFile(e.target.files[0]);e.target.value='';}}/></div>}
 {error&&<div className="error-message" role="alert"><TriangleAlert size={16}/>{error}</div>}
 <div className="detection-layout"><section className="panel scope-panel"><div className="scope-heading"><div><span className={'signal-dot '+(alarm?'alarm':'')}/><b>{selected.code}</b><small>{selected.name}</small></div><span className="mono">t = {fmt(cursor,0)} / {fmt(T-1,0)}</span></div><Chart option={option} height={454}/>
 <div className="player"><div className="player-buttons"><button aria-label="重置播放" title="重置" onClick={reset}><RotateCcw size={17}/></button><button aria-label="上一个检测事件" title="上一个事件" disabled={mode==='live'} onClick={()=>jump(-1)}><SkipBack size={17}/></button><button className="play-button" aria-label={playing?'暂停播放':'开始播放'} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={19}/>:<Play size={19}/>}</button><button aria-label="下一个检测事件" title="下一个事件" disabled={mode==='live'} onClick={()=>jump(1)}><SkipForward size={17}/></button></div><input aria-label="检测播放进度" type="range" min="0" max={T-1} value={cursor} disabled={mode==='live'} onChange={e=>{setPlaying(false);setCursor(Number(e.target.value));}}/><select aria-label="播放倍率" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,1,2,5].map(s=><option key={s} value={s}>{s}×</option>)}</select></div>
 <div className="scope-caption"><span>{mode==='replay'?'1× = 每秒8个演示步':'每个窗口执行真实模型前向计算'} · {ds.sampling}</span><span>{uploaded?filename:mode==='live'?'当前实验输入 · 已知构造标签':exp.scoreMethod}</span></div></section>
 <aside className="detection-sidebar"><section className="current-state"><div className="state-heading"><span>当前判断</span><span className="mono">t {cursor}</span></div><div className={'state-word '+(alarm?'alarm':'normal')}><span/>{currentScore==null?'等待推理':alarm?'触发报警':'正常状态'}</div><div className="score-value"><span>异常分数</span><strong className="mono">{fmt(currentScore,5)}</strong></div><div className="threshold-row"><span>判断阈值</span><b className="mono">{fmt(threshold,5)}</b></div><div className="state-footer">{mode==='replay'?(arrays.labels[cursor]?'该时刻包含构造异常':'该时刻标签为正常'):busy?'窗口计算中…':last?'窗口耗时 '+fmt(last.elapsedMs,0)+' ms':'点击播放或计算当前窗口'}</div>{mode==='live'&&<button className="outline full" disabled={busy||playing} onClick={()=>void process(cursor)}><Radio size={15}/>计算当前窗口</button>}</section>
 <section className="metrics-panel"><div className="section-title"><h3>累计检测效果</h3><span className="mono">{mode==='replay'?cursor+1:records.length} 点</span></div><div className="metric-highlight"><span>F1 分数</span><strong className="mono">{uploaded?'—':pct(stats.f1)}</strong></div><div className="metric-pair"><div><span>Precision</span><b className="mono">{uploaded?'—':pct(stats.precision)}</b></div><div><span>Recall</span><b className="mono">{uploaded?'—':pct(stats.recall)}</b></div></div><div className="confusion-grid">{[['正确检出','TP',stats.tp,'tp'],['误报','FP',stats.fp,'fp'],['漏报','FN',stats.fn,'fn'],['正常判对','TN',stats.tn,'tn']].map(([label,abbr,value,cls])=><div className={'confusion-cell '+cls} key={abbr}><span>{label}<small>{abbr}</small></span><b className="mono">{uploaded?'—':fmt(Number(value),0)}</b></div>)}</div><small>{uploaded?'上传数据没有已知标签，展示分数与报警。':'仅统计已经处理的时刻，回放拖动后同步重算。'}</small></section>
 </aside></div>
 <div className="detection-bottom"><section className="panel event-panel"><div className="section-title"><h2>最近的检测事件</h2><span>点击定位片段</span></div>{mode==='live'?<div className="live-description"><Radio size={22}/><p>{last?.source||'加载当前模型的固定网络参数，接收训练尺度窗口。'}<small>推理方式：当前窗口末点误差；已观测窗口内生成周期掩码。</small></p></div>:events.length?<div className="event-list">{events.map(i=>{const pred=arrays.scores[i]>exp.threshold;const y=arrays.labels[i]>0;const tag=pred?y?'正确检出':'误报':y?'漏报':'正常';return <button key={i} onClick={()=>{setCursor(i);setPlaying(false);}}><span className={'event-dot '+(tag==='误报'?'fp':tag==='漏报'?'fn':'')}/><span className="mono">t {i}</span><b>{tag}</b><span className="mono">{fmt(arrays.scores[i],4)}</span><ChevronRight size={15}/></button>;})}</div>:<p className="empty-state">播放推进后，检测事件将显示在这里。</p>}</section>
 <section className="panel offline-panel"><div className="section-title"><h2>整段离线评价</h2><span>实验 {exp.id}</span></div><div className="offline-stats"><div><span>直接逐点 F1</span><b className="mono">{pct(exp.metrics.direct.f1)}</b></div><div><span>点调整 F1</span><b className="mono">{pct(exp.metrics.adjusted.f1)}</b></div><div><span>连续分数 AUC</span><b className="mono">{fmt(exp.metrics.auc)}</b></div></div><p>点调整将已命中的异常区间补记为检出，用于离线评价。系统报警轨保持逐点越阈值的实际结果。</p><small>阈值来源：{exp.thresholdSource}<br/>成果来源：{exp.source}</small></section></div>
 </>;
}

