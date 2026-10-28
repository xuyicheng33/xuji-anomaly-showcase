import {useEffect,useMemo,useRef,useState} from 'react';
import {type Journey} from '../journey';
import {useCurveData} from './useCurveData';
import {Heading,Section,colors} from './ReportUI';
import Curve from './Curve';
import {Footnote} from './notes';
import './chapters.css';

type Props={data:Journey;feature?:number;setFeature?:(feature:number)=>void};
const number=(value:number,digits=3)=>value.toLocaleString('zh-CN',{maximumFractionDigits:digits});
const chartRange=(values:(number|null)[]):[number,number]=>{
 const finite=values.filter((v):v is number=>v!==null&&Number.isFinite(v));
 const min=finite.length?Math.min(...finite):0,max=finite.length?Math.max(...finite):1,pad=(max-min)*.12||Math.max(Math.abs(max)*.02,.1);
 return [min-pad,max+pad];
};

export default function DataChapter({data,feature:sharedFeature,setFeature:shareFeature}:Props){
 const [localFeature,setLocalFeature]=useState(4),[view,setView]=useState<'raw'|'clean'>('raw');
 const feature=sharedFeature??localFeature,point=data.features.find(f=>f.index===feature)??data.features[4];
 const chooseFeature=(value:number)=>{setLocalFeature(value);shareFeature?.(value)};
 const normalizationRef=useRef<HTMLDivElement>(null),[normalizationVisible,setNormalizationVisible]=useState(false);
 const [offset,setOffset]=useState(Math.min(5300,data.summary.cleanRows-64)),[month,setMonth]=useState('all'),[sample,setSample]=useState(0);
 const {raw,clean,train}=data.datasets;
 const rawAsset=useCurveData(raw,raw.keys.indexOf(point.key)),cleanAsset=useCurveData(clean,clean.keys.indexOf(point.key)),trainAsset=useCurveData(normalizationVisible?train:null,train.keys.indexOf(point.key));
 const loaded=rawAsset.data&&cleanAsset.data?{raw:rawAsset.data,clean:cleanAsset.data}:null,error=rawAsset.error||cleanAsset.error;
 useEffect(()=>{if(!normalizationRef.current)return;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setNormalizationVisible(true);observer.disconnect()}},{rootMargin:'300px'});observer.observe(normalizationRef.current);return()=>observer.disconnect()},[]);
 const rawByTime=useMemo(()=>new Map(raw.times.map((time,i)=>[time,i])),[raw.times]);
 const cleanByTime=useMemo(()=>new Map(clean.times.map((time,i)=>[time,i])),[clean.times]);
 const months=useMemo(()=>Array.from(new Set(clean.times.map(time=>time.slice(0,7)))),[clean.times]);
 const monthStart=month==='all'?0:clean.times.findIndex(time=>time.startsWith(month));
 const monthEnd=month==='all'?clean.shape[0]:clean.times.reduce((last,time,index)=>time.startsWith(month)?index+1:last,0);
 const maxStart=Math.max(monthStart,monthEnd-64),from=Math.min(Math.max(offset,monthStart),maxStart),times=clean.times.slice(from,from+64);
 const trainCol=train.keys.indexOf(point.key);
 const rawLine=times.map(time=>{const row=rawByTime.get(time);const value=row===undefined||!loaded?NaN:loaded.raw[row];return Number.isFinite(value)?value:null});
 const cleanLine=times.map(time=>{const row=cleanByTime.get(time);const value=row===undefined||!loaded?NaN:loaded.clean[row];return Number.isFinite(value)?value:null});
 const line=view==='raw'?rawLine:cleanLine;
 const norm=useMemo(()=>{
  if(!trainAsset.data)return null;
  let min=Infinity,max=-Infinity;
  for(let i=0;i<train.shape[0];i++){const value=trainAsset.data[i];if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value)}}
  const start=Math.min(5299,Math.max(0,train.shape[0]-64));
  const values=Array.from({length:Math.min(64,train.shape[0])},(_,i)=>trainAsset.data![start+i]);
  return {min,max,start,values,normalized:values.map(value=>max===min?0:(value-min)/(max-min))};
 },[trainAsset.data,train,trainCol]);
 const sampleIndex=Math.min(sample,(norm?.values.length??1)-1),missing=data.missingExample;
 const missingPoint=data.features.find(f=>f.index===missing.feature)??data.features[missing.feature];
 return <div className="chapter-refined data-chapter">
  <Heading number="01" title="监测数据预处理">筛选有效记录，完成缺失填补、数据划分与归一化。</Heading>
  <div className="data-ledger" aria-label="数据规模">
   <div><span>原始记录</span><strong>{number(data.summary.rawRows,0)}</strong><small>{data.summary.rawFeatures} 个测点</small></div>
   <div><span>整理后记录</span><strong>{number(data.summary.cleanRows,0)}</strong><small>{data.summary.features} 个保留测点</small></div>
   <div><span>训练集</span><strong>{number(data.summary.trainRows,0)}</strong><small>按时间取前段</small></div>
   <div><span>测试集</span><strong>{number(data.summary.testRows,0)}</strong><small>按时间取后段</small></div>
  </div>
  <p className="ledger-caption">整理后保留 7,992 个时刻，本次实验使用其中 7,990 条记录。</p>

  <Section title={<>原始记录与处理结果<Footnote note="data-records" context={{feature:point.index,from}}/></>}>
   <div className="data-controls">
    <div className="segmented" aria-label="记录版本">{([['raw','原始记录'],['clean','整理结果']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div>
    <label className="field">测点<select value={point.index} aria-label="数据测点" onChange={e=>chooseFeature(+e.target.value)}>{data.features.map(f=><option key={f.index} value={f.index}>{f.label}（{f.key}）</option>)}</select></label>
    <label className="field">时间范围<select value={month} aria-label="数据时间范围" onChange={e=>{const value=e.target.value;setMonth(value);if(value!=='all')setOffset(clean.times.findIndex(time=>time.startsWith(value)))}}><option value="all">全部有效时刻</option>{months.map(value=><option key={value} value={value}>{value.replace('-',' 年 ')} 月</option>)}</select></label>
   </div>
   <div className="chapter-chart-panel">
    {error?<div className="chapter-loading" role="alert"><p>{error}</p><button onClick={()=>{if(rawAsset.error)rawAsset.retry();if(cleanAsset.error)cleanAsset.retry()}}>重新读取</button></div>:loaded?<>
     <div className="chart-context"><span>{point.label} <small>原始单位</small></span><span>{times[0]} — {times.at(-1)}</span></div>
     <Curve title={view==='raw'?'原始记录':'整理结果'} lines={[{name:point.key,values:line,color:colors.input}]} times={times} range={chartRange([...rawLine,...cleanLine])} height={260}/>
     <label className="slider-label">片段起点<input aria-label="数据片段起点" type="range" min={monthStart} max={maxStart} value={from} onChange={e=>setOffset(+e.target.value)}/><span>{number(from+1,0)}—{number(from+times.length,0)}</span></label>
     <p className="chart-footnote">曲线断点表示原始值缺失。</p>
    </>:<p className="chapter-loading" role="status">正在读取监测记录…</p>}
   </div>
  </Section>

  <Section title={<>无效记录与缺失值处理<Footnote note="data-source"/></>}>
   <div className="editorial-grid data-cleaning-copy"><div><span className="small-step">01 / 测点</span><h3>136 → 125</h3><p>移除 11 个全缺失测点及 768 条无效时间记录。</p></div><div><span className="small-step">02 / 缺失值</span><h3>170 个缺失值填 0</h3></div></div>
   <div className="missing-proof"><div><span>原始记录</span><strong>缺失</strong></div><span className="proof-arrow" aria-hidden="true">→</span><div><span>整理文件</span><strong>{missing.after[missing.selected]}</strong></div><div className="missing-proof-caption"><span>{missing.times[missing.selected]}</span><p>{missingPoint.label}<br/><small>{missingPoint.key}</small></p></div></div>
  </Section>

  <Section title={<>训练集与测试集划分<Footnote note="data-split"/></>}>
   <p className="reading-copy">按时间顺序划分训练集与测试集，均包含 125 个测点。</p>
   <div className="balanced-split"><div><span>01 / 训练集</span><strong>{number(data.summary.trainRows,0)}<small> 个时刻</small></strong><p>{data.summary.trainStart}<br/>— {data.summary.trainEnd}</p></div><div><span>02 / 测试集</span><strong>{number(data.summary.testRows,0)}<small> 个时刻</small></strong><p>{data.summary.testStart}<br/>— {data.summary.testEnd}</p></div></div>
  </Section>

  <div ref={normalizationRef} className="normalization-section"><Section title={<>测点数值归一化<Footnote note="normalization"/></>}>
   <div className="normalization-heading"><p className="reading-copy">训练集与测试集共用训练段的最小值和最大值，归一化至 0—1。</p><label className="field">测点<select aria-label="归一化测点" value={point.index} onChange={e=>chooseFeature(+e.target.value)}>{data.features.map(f=><option key={f.index} value={f.index}>{f.label}（{f.key}）</option>)}</select></label></div>
   {norm?<><div className="normalization-facts"><div><span>训练段最小值</span><strong>{number(norm.min,4)}</strong></div><div><span>训练段最大值</span><strong>{number(norm.max,4)}</strong></div><div><span>当前样本时间</span><strong className="sample-time">{train.times[norm.start+sampleIndex]}</strong></div></div>
    <div className="normalization-plots"><Curve title="原始单位" lines={[{name:point.label,values:norm.values,color:colors.input}]} times={train.times.slice(norm.start,norm.start+64)} selected={sampleIndex} range={chartRange(norm.values)} height={205} onSelect={setSample}/><Curve title="归一化后" lines={[{name:point.label,values:norm.normalized,color:colors.recon}]} times={train.times.slice(norm.start,norm.start+64)} selected={sampleIndex} height={205} onSelect={setSample}/></div>
    <label className="slider-label">选择样本<input aria-label="归一化样本" type="range" min="0" max={norm.values.length-1} value={sampleIndex} onChange={e=>setSample(+e.target.value)}/><span>{sampleIndex+1} / {norm.values.length}</span></label>
    <div className="normalization-equation"><span>{norm.min===norm.max?`训练段为常量 ${number(norm.min,4)}，按常量列规则取值`:`（${number(norm.values[sampleIndex],4)} − ${number(norm.min,4)}）÷（${number(norm.max,4)} − ${number(norm.min,4)}）`}</span><span aria-hidden="true">=</span><strong>{norm.normalized[sampleIndex].toFixed(4)}</strong></div>
   </>:trainAsset.error?<div className="chapter-loading" role="alert"><p>{trainAsset.error}</p><button onClick={trainAsset.retry}>重新读取训练样本</button></div>:<p className="chapter-loading" role="status">正在读取训练样本…</p>}
  </Section></div>

 </div>;
}
