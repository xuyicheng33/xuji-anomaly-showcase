import type {Arrays,Experiment,Metric} from './types';
export async function api<T>(path:string,body?:unknown):Promise<T>{
 const r=await fetch('/api'+path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw new Error(typeof result.detail==='string'?result.detail:JSON.stringify(result.detail));return result as T;
}
export async function arraysFor(exp:Experiment):Promise<Arrays>{
 const keys=['raw','recon','errors','scores','labels','matrix'];
 const entries=await Promise.all(keys.map(async key=>{
  const r=await fetch(exp.files[key].url);if(!r.ok)throw new Error('数据加载失败：'+key);
  const buf=await r.arrayBuffer();const dtype=exp.files[key].dtype;
  return [key,dtype==='float64'?new Float64Array(buf):dtype==='uint8'?new Uint8Array(buf):new Float32Array(buf)];
 }));
 return Object.fromEntries(entries) as Arrays;
}
export const fmt=(x:number|null|undefined,digits=3)=>x==null?'—':x.toLocaleString('zh-CN',{maximumFractionDigits:digits});
export const pct=(x:number|null|undefined)=>x==null?'—':(x*100).toFixed(1)+'%';
export function metric(y:ArrayLike<number>,scores:ArrayLike<number>,threshold:number,end:number):Metric{
 let tp=0,fp=0,fn=0,tn=0;
 for(let i=0;i<=end&&i<y.length;i++){if(y[i]){if(scores[i]>threshold)tp++;else fn++;}else if(scores[i]>threshold)fp++;else tn++;}
 return {tp,fp,fn,tn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
}
export function column(x:ArrayLike<number>,c:number,C:number,start=0,end=Math.floor(x.length/C)):number[]{return Array.from({length:end-start},(_,i)=>x[(i+start)*C+c]);}
export function csvRows(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell.trim());cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=ch;}
 if(quoted)throw new Error('CSV引号未闭合');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}

