import {useState} from 'react';
import {Footnote} from './notes';

/** The eight source samples are mapped onto existing destination positions. */
export default function LengthConstruction({values,insertion}:{values:number[];insertion:'replace'|'blend'}){
 const [sample,setSample]=useState(0);
 return <section className="length-construction" aria-labelledby="length-title">
  <h3 id="length-title">采样与写入位置<Footnote note="length-sampling"/></h3>
  <p>取第 19—26 点的 8 个值，每个值重复 3 次，得到 24 点素材，写入第 19—42 点。</p>
  <div className="length-sampling">
   <div className="length-row-label"><span>来源 · 第19—26点</span><span>8 个值</span></div>
   <div className="length-source">{values.map((v,i)=><button key={i} aria-label={`查看来源第 ${19+i} 点`} aria-pressed={sample===i} onClick={()=>setSample(i)}><strong>{String.fromCharCode(65+i)}</strong><span>{v.toFixed(3)}</span></button>)}</div>
   <div className="length-repeat">每点重复 3 次 <span aria-hidden="true">↓</span></div>
   <div className="length-destination" aria-label="8个值重复为24个值">{Array.from({length:24},(_,i)=><button key={i} aria-label={`素材第 ${i+1} 点来自 ${String.fromCharCode(65+Math.floor(i/3))}`} aria-pressed={sample===Math.floor(i/3)} onClick={()=>setSample(Math.floor(i/3))}>{String.fromCharCode(65+Math.floor(i/3))}</button>)}</div>
   <p className="length-mapping" aria-live="polite">{String.fromCharCode(65+sample)} = {values[sample]?.toFixed(4)}，对应写入第 {19+sample*3}—{21+sample*3} 点。</p>
  </div>
  <div className="length-window" aria-label="64点窗口的写入范围"><span>第1—18点<br/><strong>保持原值</strong></span><span>第19—42点<br/><strong>{insertion==='replace'?'覆盖原来的24个值':'与原来的24个值混合'}</strong></span><span>第43—64点<br/><strong>位置不变</strong></span></div>
  <p className="length-total">时间轴仍为 64 点。增加的是素材中的重复采样，写入区间已有的位置，不向序列末尾追加数据。</p>
 </section>;
}
