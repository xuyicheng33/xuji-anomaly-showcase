import {useEffect,useState} from 'react';
import type {Journey} from '../journey';
import {MissingExample} from './DataCleaning';
import cleaning from './cleaning-data.json';
import './data-preparation.css';

type View='raw'|'missing'|'crop';
let remembered:{view:View;example:number;block:number}={view:'raw',example:0,block:0};
const value=(n:number|null)=>n===null?'缺失':n.toFixed(4);
const count=(n:number)=>n.toLocaleString('zh-CN');

export default function RecordExamples({data}:{data:Journey}){
 const [selection,setSelection]=useState(remembered);
 useEffect(()=>{remembered=selection},[selection]);
 const crop=cleaning.cropExamples[selection.block];
 return <div className="record-examples">
  <div className="segmented record-example-tabs" aria-label="数据处理例子">{([['raw','原始数据'],['missing','缺失值填补'],['crop','无效记录裁剪']] as const).map(([view,label])=><button key={view} aria-pressed={selection.view===view} onClick={()=>setSelection(previous=>({...previous,view}))}>{label}</button>)}</div>
  {selection.view==='raw'?<div className="record-example-panel">
   <div className="example-heading"><h3>原始数据片段</h3><span>2022-03-29 04:00—08:00</span></div>
   <div className="reference-table-scroll raw-record-example" tabIndex={0} role="region" aria-label="原始数据片段" aria-describedby="raw-example-hint"><table aria-label="原始数据片段"><thead><tr><th scope="col">时间</th>{cleaning.rawExample.keys.map(key=><th key={key} scope="col"><span>{data.features.find(point=>point.key===key)?.label??'底部油温'}</span><code>{key}</code></th>)}</tr></thead><tbody>{cleaning.rawExample.rows.map(row=><tr key={row.number}><th scope="row">{row.time.slice(11)}</th>{row.values.map((n,i)=><td key={i} className={n===null?'raw-missing-cell':undefined}>{n===null?<span className="missing-value">---</span>:value(n)}</td>)}</tr>)}</tbody></table></div>
   <p className="example-caption">“---”表示缺失。网侧绕组温度有单点缺失，底部油温为全缺失测点。</p>
   <p className="reference-table-hint" id="raw-example-hint">左右滑动查看各测点。</p>
  </div>:selection.view==='missing'?<div className="record-example-panel">
   <div className="example-heading"><h3>缺失值填补</h3><div className="segmented" aria-label="说明页缺失片段">{cleaning.missingExamples.map((sample,example)=><button key={sample.key} aria-pressed={selection.example===example} onClick={()=>setSelection(previous=>({...previous,example}))}>{sample.label}</button>)}</div></div>
   <MissingExample data={data} example={selection.example}/>
  </div>:<div className="record-example-panel">
   <div className="example-heading"><h3>无效记录裁剪</h3><div className="segmented" aria-label="无效记录位置">{cleaning.cropExamples.map((sample,block)=><button key={block} aria-pressed={selection.block===block} onClick={()=>setSelection(previous=>({...previous,block}))}>{block===0?'中间':'末尾'} {sample.count} 条</button>)}</div></div>
   <div className="missing-context"><strong>换流器电压</strong><code>{crop.key}</code></div>
   <div className="reference-table-scroll crop-record-example" tabIndex={0} role="region" aria-label="无效记录裁剪前后对照" aria-describedby="crop-example-hint"><table><thead><tr><th scope="col">原始记录行</th><th scope="col">时间</th><th scope="col">处理前</th><th scope="col">处理后</th></tr></thead><tbody>{crop.rows.map(row=><tr key={row.start} className={row.removed?'removed-record-row':undefined}><th scope="row">{row.start===row.end?count(row.start):`${count(row.start)}—${count(row.end)}`}</th><td>{row.time??'---'}</td><td>{row.removed?'---':value(row.value)}</td><td>{row.removed?<strong>删除 {crop.count} 条</strong>:value(row.value)}</td></tr>)}</tbody></table></div>
   <p className="example-caption">{selection.block===0?'删除中间无效行，前后有效记录按原顺序衔接。':'删除末尾无效行，最后有效记录保留。'}</p>
   <p className="reference-table-hint" id="crop-example-hint">左右滑动查看处理前后。</p>
  </div>}
 </div>;
}
