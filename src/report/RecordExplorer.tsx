import {useEffect,useMemo,useRef,useState} from 'react';
import type {Journey} from '../journey';
import {useCurveData} from './useCurveData';
import Curve from './Curve';
import {colors} from './ReportUI';
import './chapters.css';
import './data-preparation.css';

type Selection={key:string;month:string;begin:string;end:string;scope:'range'|'fragment';view:'both'|'raw'|'clean';offset:number};
let remembered:Selection|null=null;
const format=(v:number|null)=>v!==null&&Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:6}):'缺失';

export default function RecordExplorer({data,initialFeature,initialFrom,requested}:{data:Journey;initialFeature?:number;initialFrom?:number;requested:boolean}){
 const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(requested);
 const {raw,clean}=data.datasets;
 const [selection,setSelection]=useState<Selection>(()=>{
  const base=remembered??{key:data.features[5].key,month:'all',begin:clean.times[0],end:clean.times.at(-1)!,scope:'range',view:'both',offset:0};
  return {...base,...(initialFeature!==undefined?{key:data.features[initialFeature].key}:{}),...(initialFrom!==undefined?{offset:initialFrom,scope:'fragment' as const,month:'all'}:{})};
 });
 const change=(patch:Partial<Selection>)=>setSelection(previous=>({...previous,...patch}));
 useEffect(()=>{remembered=selection},[selection]);
 useEffect(()=>{if(requested)setVisible(true)},[requested]);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);observer.disconnect()}},{rootMargin:'150px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect()},[]);
 const rawIndex=raw.keys.indexOf(selection.key),cleanIndex=clean.keys.indexOf(selection.key);
 const rawAsset=useCurveData(visible?raw:null,rawIndex),cleanAsset=useCurveData(visible&&cleanIndex>=0?clean:null,cleanIndex);
 const ready=!!rawAsset.data&&(cleanIndex<0||!!cleanAsset.data),error=rawAsset.error||cleanAsset.error;
 const point=data.features.find(f=>f.key===selection.key),label=point?.label??'底部油温（全缺失测点）';
 const rawByTime=useMemo(()=>new Map(raw.times.map((time,i)=>[time,i])),[raw.times]);
 const months=useMemo(()=>Array.from(new Set(clean.times.map(time=>time.slice(0,7)))),[clean.times]);
 const indices=useMemo(()=>clean.times.flatMap((time,i)=>
  selection.month==='custom'?(time>=selection.begin&&time<=selection.end?[i]:[]):selection.month==='all'||time.startsWith(selection.month)?[i]:[]),[clean.times,selection.month,selection.begin,selection.end]);
 const maxOffset=Math.max(0,indices.length-64),offset=Math.max(0,Math.min(selection.offset,maxOffset));
 const rows=selection.scope==='fragment'?indices.slice(offset,offset+64):indices;
 const times=rows.map(i=>clean.times[i]);
 const rawLine=rows.map(i=>{const row=rawByTime.get(clean.times[i]),v=row===undefined?NaN:rawAsset.data?.[row];return v!==undefined&&Number.isFinite(v)?v:null});
 const cleanLine=rows.map(i=>{const v=cleanAsset.data?.[i];return cleanIndex>=0&&v!==undefined&&Number.isFinite(v)?v:null});
 const lines=[...(selection.view!=='clean'?[{name:'原始记录',values:rawLine,color:colors.input}]:[]),...(selection.view!=='raw'&&cleanIndex>=0?[{name:'整理结果',values:cleanLine,color:colors.recon,dash:true}]:[])];
 const finite=[...rawLine,...cleanLine].filter((n):n is number=>n!==null),lo=finite.length?Math.min(...finite):0,hi=finite.length?Math.max(...finite):1,pad=(hi-lo)*.12||Math.max(Math.abs(hi)*.02,.1);
 const detailRows=indices.slice(offset,offset+64);
 return <div ref={ref} className="record-explorer">
  <div className="data-controls">
   <label className="field">测点<select aria-label="数据测点" value={selection.key} onChange={e=>change({key:e.target.value})}><optgroup label="保留的125个测点">{data.features.map(f=><option key={f.key} value={f.key}>{f.label}（{f.key}）</option>)}</optgroup><optgroup label="剔除的11个全缺失测点">{data.removedFeatures.map(key=><option key={key} value={key}>底部油温（{key}）</option>)}</optgroup></select></label>
   <label className="field">时间范围<select aria-label="数据时间范围" value={selection.month} onChange={e=>change({month:e.target.value,offset:0})}><option value="all">全部时间范围</option>{months.map(month=><option key={month} value={month}>{month.replace('-',' 年 ')} 月</option>)}<option value="custom">自定义时间范围</option></select></label>
   {selection.month==='custom'&&<div className="explorer-dates"><label className="field">开始时间<input type="datetime-local" aria-label="记录开始时间" value={selection.begin.replace(' ','T')} min={clean.times[0].replace(' ','T')} max={selection.end.replace(' ','T')} onChange={e=>{if(e.target.value)change({begin:e.target.value.replace('T',' '),offset:0})}}/></label><label className="field">结束时间<input type="datetime-local" aria-label="记录结束时间" value={selection.end.replace(' ','T')} min={selection.begin.replace(' ','T')} max={clean.times.at(-1)!.replace(' ','T')} onChange={e=>{if(e.target.value)change({end:e.target.value.replace('T',' '),offset:0})}}/></label></div>}
  </div>
  <div className="explorer-toolbar"><div className="segmented" aria-label="记录版本">{([['both','前后对照'],['raw','原始记录'],['clean','整理结果']] as const).map(([view,text])=><button key={view} aria-pressed={selection.view===view} disabled={cleanIndex<0&&view==='clean'} onClick={()=>change({view})}>{text}</button>)}</div><div className="segmented" aria-label="曲线范围">{([['range','完整范围'],['fragment','64 条片段']] as const).map(([scope,text])=><button key={scope} aria-pressed={selection.scope===scope} onClick={()=>change({scope})}>{text}</button>)}</div></div>
  <div className="chapter-chart-panel">
   {error?<div className="chapter-loading" role="alert"><p>{error}</p><button onClick={()=>{if(rawAsset.error)rawAsset.retry();if(cleanAsset.error)cleanAsset.retry()}}>重新读取记录</button></div>:!ready?<p className="chapter-loading" role="status">正在读取监测记录…</p>:rows.length===0?<p className="chapter-loading" role="status">所选时间范围没有有效时间记录，请调整起止时间。</p>:<>
    <div className="chart-context"><span><strong>{label}</strong><code>{selection.key}</code></span><span>{times[0]} — {times.at(-1)}<br/>{rows.length.toLocaleString('zh-CN')} 条记录，原始单位</span></div>
    {cleanIndex<0?<p className="chapter-loading">该测点全部缺失，整理时已删除对应列。</p>:<Curve title="监测记录曲线" lines={lines} times={times} range={[lo-pad,hi+pad]} height={270} onSelect={selection.scope==='range'?i=>change({offset:Math.min(i,maxOffset)}):undefined}/>}
    <label className="slider-label">{selection.scope==='fragment'?'片段起点':'明细起点'}<input aria-label="数据片段起点" type="range" min="0" max={maxOffset} value={offset} onChange={e=>change({offset:+e.target.value})}/><span>{offset+1}—{Math.min(offset+64,indices.length)}</span></label>
    <p className="chart-footnote">原始曲线断点表示缺失值，整理结果在对应位置填 0。</p>
   </>}
  </div>
  {ready&&rows.length>0&&<details className="records-detail-toggle"><summary>查看逐条数据明细<span>{detailRows.length} 条记录，随明细起点切换</span></summary><div className="reference-table-scroll record-details" role="region" tabIndex={0} aria-label="当前片段数据明细"><table><thead><tr><th>时间</th><th>原始记录</th><th>整理结果</th></tr></thead><tbody>{detailRows.map(i=>{const time=clean.times[i],ri=rawByTime.get(time);return <tr key={time}><th scope="row"><time dateTime={time.replace(' ','T')}><span>{time.split(' ')[0]}</span>{' '}<span>{time.split(' ')[1]}</span></time></th><td>{format(ri===undefined?null:rawAsset.data![ri])}</td><td>{cleanIndex<0?'已剔除':format(cleanAsset.data![i])}</td></tr>})}</tbody></table></div></details>}
 </div>;
}
