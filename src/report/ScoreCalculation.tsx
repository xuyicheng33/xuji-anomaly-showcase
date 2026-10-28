import {useEffect,useMemo,useRef,useState} from 'react';
import {loadWindow,type Journey,type Model,type Asset} from '../journey';
import {Footnote} from './notes';
import {Outcome} from './ReportUI';
import {useDataAsset} from './useDataAsset';
import {useWindowInput} from './useCurveData';
import Fraction from './Fraction';
import './calculation.css';

export function pointCalculation(input:Float64Array,recon:Float32Array,index:number,local:number){
  const rows=Array.from({length:125},(_,feature)=>{
    const value=input[index*125+feature],prediction=recon[local*125+feature],difference=value-prediction;
    return {feature,value,prediction,difference,error:difference*difference};
  });
  const sum=rows.reduce((total,row)=>total+row.error,0);
  return {rows,sum,score:sum/125};
}
const decimal=(value:number)=>value.toFixed(9);

export function ScoreCalculation({data,model,input,recon,start,point,id='window-calculation',focusFeature=-1,labels}:{data:Journey;model:Model;input:Float64Array;recon:Float32Array;start:number;point:number;id?:string;focusFeature?:number;labels?:Float64Array|null}){
  const index=start+point,calculation=useMemo(()=>pointCalculation(input,recon,point,point),[input,recon,index,point]);
  const body=useRef<HTMLTableSectionElement>(null);
  useEffect(()=>{if(focusFeature<0)return;const row=body.current?.rows[focusFeature];const scroller=body.current?.closest('.calculation-table-scroll');if(row&&scroller)scroller.scrollTop=row.offsetTop-45},[focusFeature]);
  return <section className="score-calculation" id={id} aria-label="异常分数计算过程" data-point={index+1}>
    <div className="calculation-heading"><div><h2>异常分数计算<Footnote note="score-calculation" reference={'ref-'+id}/></h2><p>{model.name}，第 {start+1}—{start+64} 点窗口，窗口内第 {point+1} / 64 个时刻</p></div></div>
    <p className="calculation-time">{data.times[index]}，第 {index+1} 点，归一化数值</p>
    <div className="calculation-layout">
      <div><h3><span>01</span> 逐项相减，再平方</h3><div className="calculation-table-scroll" tabIndex={0} role="region" aria-label="全部125个测点计算明细">
        <table className="calculation-table"><thead><tr><th scope="col">测点</th><th scope="col">输入</th><th scope="col">重建</th><th scope="col">差值</th><th scope="col">平方误差</th></tr></thead>
          <tbody ref={body}>{calculation.rows.map(row=><tr key={row.feature} className={row.feature===focusFeature?'selected-sensor':undefined} data-feature={row.feature}><th scope="row"><span>{row.feature+1}. {data.features[row.feature].label}</span><small>{data.features[row.feature].key}</small></th><td>{decimal(row.value)}</td><td>{decimal(row.prediction)}</td><td>{decimal(row.difference)}</td><td>{decimal(row.error)}</td></tr>)}</tbody>
        </table></div><p className="calculation-help">平方误差 =（输入 − 重建）²。</p>{focusFeature>=0&&labels&&<p className="calculation-help">第 {index+1} 点，{data.features[focusFeature].label}标签：<span className="note-anchor">{labels[index*125+focusFeature]?'异常':'正常'}<Footnote note="anomaly-cases" reference={'ref-'+id+'-label'}/></span></p>}</div>
      <div className="calculation-total"><h3><span>02</span> 汇总全部125项</h3><p>平方误差合计</p><strong className="sum-value" data-testid={id+'-sum'}>{decimal(calculation.sum)}</strong><div className="calculation-equation"><Fraction numerator={decimal(calculation.sum)} denominator="125"/><span className="equation-result"><span>=</span><strong data-testid={id==='window-calculation'?'calculated-score':id+'-score'}>{decimal(calculation.score)}</strong></span></div><h3><span>03</span> 与窗口阈值比较</h3><p className="calculation-comparison">{decimal(calculation.score)} <b>{calculation.score>model.windowThreshold?'>':'≤'}</b> {decimal(model.windowThreshold)}</p><Outcome label={data.labels[index]} score={calculation.score} model={{...model,threshold:model.windowThreshold}}/></div>
    </div>
  </section>;
}

export function coveringWindows(index:number,length:number){return Array.from({length:Math.min(index,length-64)-Math.max(0,index-63)+1},(_,i)=>Math.max(0,index-63)+i);}
type IndexManifest={resultVersion:string;models:Record<string,Asset>};
let indexRequest:Promise<IndexManifest>|null=null;
function loadIndex(){if(!indexRequest)indexRequest=fetch(import.meta.env.BASE_URL+'data/journey/calculation-v1/manifest.json').then(r=>{if(!r.ok)throw Error('计算索引读取失败');return r.json() as Promise<IndexManifest>}).catch(e=>{indexRequest=null;throw e});return indexRequest;}

export function PlaybackCalculation({data,model,index,playing,pause}:{data:Journey;model:Model;index:number|null;playing:boolean;pause:()=>void}){
  const [open,setOpen]=useState(false),[catalog,setCatalog]=useState<IndexManifest|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[selected,setSelected]=useState<number|null>(null);
  const [result,setResult]=useState<Awaited<ReturnType<typeof loadWindow>>|null>(null),[windowError,setWindowError]=useState(''),[windowAttempt,setWindowAttempt]=useState(0);
  const section=useRef<HTMLElement>(null),detail=useRef<HTMLDivElement>(null);
  const inputAsset=useWindowInput(data.input,selected??0,selected!==null),input=inputAsset.data;
  const scoresAsset=useDataAsset(open&&catalog?catalog.models[model.id]:null);
  useEffect(()=>{if(!open)return;let active=true;setError('');loadIndex().then(c=>{if(c.resultVersion!==data.resultVersion)throw Error('计算索引版本不一致');if(active)setCatalog(c)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[open,attempt,data.resultVersion]);
  useEffect(()=>{setSelected(null);setResult(null);setWindowError('')},[index,model.id]);
  useEffect(()=>{if(playing)setOpen(false)},[playing]);
  useEffect(()=>{if(selected===null)return;let active=true;setWindowError('');setResult(null);loadWindow(model,selected).then(r=>{if(active)setResult(r)}).catch(e=>{if(active)setWindowError(e.message)});return()=>{active=false}},[selected,model.id,windowAttempt]);
  const starts=index===null?[]:coveringWindows(index,data.times.length);
  const rows=scoresAsset.data&&index!==null?starts.map(start=>({start,score:scoresAsset.data![start*64+index-start]})):[];
  const total=rows.reduce((sum,row)=>sum+row.score,0),score=index===null?null:model.scores[index];
  const ready=result&&result.modelId===model.id&&result.start===selected&&index!==null&&index>=result.start&&index<result.start+64;
  const reveal=()=>{pause();setOpen(true);requestAnimationFrame(()=>section.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}))};
  return <section className="playback-calculation" ref={section}>
    <div className="aggregation-summary"><div><h2>当前时刻分数<Footnote note="window-aggregation"/></h2><p>{index===null?'选择时刻后查看各窗口的分数。':<>第 {index+1} 点，<span className="window-scope">{starts.length} 个窗口取平均</span></>}</p></div><div className="aggregation-formula">{score===null?<><Fraction numerator="窗口分数合计" denominator="覆盖窗口数"/><b>=</b><span>回放分数</span></>:<><Fraction numerator={decimal(rows.length?total:score*starts.length)} denominator={starts.length}/><span className="equation-result"><b>=</b><strong data-testid="aggregate-score">{decimal(score)}</strong></span></>}</div><button className="inline-link" disabled={index===null} aria-expanded={open} onClick={()=>open?setOpen(false):reveal()}>{open?'收起计算':'查看当前点计算'} {open?'↑':'↓'}</button></div>
    {open&&index!==null&&<div className="aggregation-detail result-reveal"><p>各窗口在同一时刻的125项平方误差取平均，再合并这 {starts.length} 个窗口分数。</p>{error||scoresAsset.error?<div role="alert">{error||scoresAsset.error}<button onClick={()=>{setAttempt(n=>n+1);scoresAsset.retry()}}>重试计算索引</button></div>:!rows.length?<p role="status">正在读取窗口分数…</p>:<><div className="window-score-scroll" role="region" tabIndex={0} aria-label="覆盖当前时刻的全部窗口" aria-describedby="window-score-hint"><table><thead><tr><th>覆盖窗口</th><th>窗口内位置</th><th>该时刻分数</th><th>计算明细</th></tr></thead><tbody>{rows.map(row=><tr key={row.start} className={selected===row.start?'selected-sensor':undefined}><th scope="row">第 {row.start+1}—{row.start+64} 点</th><td>{index-row.start+1} / 64</td><td>{decimal(row.score)}</td><td><button className="inline-link" aria-pressed={selected===row.start} onClick={()=>{setSelected(row.start);requestAnimationFrame(()=>detail.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}))}}>查看125项</button></td></tr>)}</tbody></table></div><p className="window-score-hint" id="window-score-hint">左右滑动查看计算明细。</p><p className="window-score-total">已计入全部 {rows.length} 个覆盖窗口：<span className="score-equation" data-testid="aggregate-equation"><Fraction numerator={decimal(total)} denominator={rows.length}/><span className="equation-result"><span>=</span><strong>{decimal(total/rows.length)}</strong></span></span></p></>}
    <div ref={detail} className="coverage-calculation">{selected!==null&&(windowError||inputAsset.error?<p role="alert">{windowError||inputAsset.error}<button onClick={()=>{setWindowAttempt(n=>n+1);inputAsset.retry()}}>重试窗口</button></p>:ready&&input?<ScoreCalculation data={data} model={model} input={input} recon={result.recon} start={result.start} point={index-result.start} id="coverage-window-calculation"/>:<p role="status">正在读取该窗口的125项计算…</p>)}</div></div>}
  </section>;
}
