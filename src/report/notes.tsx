import {useEffect, type ReactNode} from 'react';

// Stable reading order. Repeated references reuse the same number.
export const notes = [
  {id:'data-records', title:'原始记录与处理明细', page:'data'},
  {id:'data-source', title:'数据来源与测点清单', page:'data'},
  {id:'data-split', title:'训练集与测试集划分', page:'data'},
  {id:'normalization', title:'归一化公式与边界', page:'data'},
  {id:'anomaly-cases', title:'异常构造与标签规则', page:'anomalies'},
  {id:'length-sampling', title:'长度调整与采样', page:'anomalies'},
  {id:'window-settings', title:'窗口设置与结果来源', page:'training'},
  {id:'score-calculation', title:'单窗口异常分数计算', page:'detection'},
  {id:'thresholds', title:'阈值与评估规则', page:'detection'},
  {id:'point-metrics', title:'逐点指标与区间点调整', page:'detection'},
  {id:'window-aggregation', title:'连续回放与跨窗口合并', page:'playback'},
] as const;
export type NoteId = typeof notes[number]['id'];
export type NoteOrigin = {hash:string; y:number; reference:string};
let origin:NoteOrigin|null = null;
export function getNoteOrigin(){return origin;}
export function rememberNoteOrigin(reference=''){
  if(location.hash.startsWith('#/metrics'))return;
  origin={hash:location.hash||'#/',y:window.scrollY,reference};
}
export function pausePresentation(){window.dispatchEvent(new Event('showcase:pause'));}
export function usePauseOnNavigation(pause:()=>void){
  useEffect(()=>{window.addEventListener('showcase:pause',pause);return()=>window.removeEventListener('showcase:pause',pause)},[pause]);
}
export function Footnote({note,context,reference}:{note:NoteId;context?:Record<string,string|number>;reference?:string}){
  const index=notes.findIndex(item=>item.id===note),item=notes[index];
  const id=reference??`ref-${item.page}-${note}`;
  const params=new URLSearchParams({note,...Object.fromEntries(Object.entries(context??{}).map(([k,v])=>[k,String(v)]))});
  return <sup className="footnote"><a id={id} href={'#/metrics?'+params} aria-label={`注 ${index+1}：${item.title}`} onClick={()=>{rememberNoteOrigin(id);pausePresentation()}}>{index+1}</a></sup>;
}
export function NoteSection({id,children}:{id:NoteId;children:ReactNode}){
  const index=notes.findIndex(item=>item.id===id),item=notes[index];
  return <section className="explanation-entry" id={'note-'+id} tabIndex={-1} aria-labelledby={'note-title-'+id}>
    <div className="explanation-heading"><span className="explanation-number">{String(index+1).padStart(2,'0')}</span><h2 id={'note-title-'+id}>{item.title}</h2><a className="inline-link note-return" href={origin?.hash??'#/'+item.page} data-return-reference={origin?.reference??`ref-${item.page}-${id}`}>返回{origin?'引用处':'正文'} ↑</a></div>
    <div className="explanation-body">{children}</div>
  </section>;
}
