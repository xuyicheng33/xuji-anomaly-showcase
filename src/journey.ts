export type Asset = { file: string; shape: number[]; bytes: number; sha256: string };
export type Metrics = { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null; f1: number | null };
export type WindowChunk = {start:number;count:number;file:string;bytes:number;sha256:string};
export type Model = { id: string; name: string; threshold: number; thresholdSource: string; scores: number[]; history: {epoch: number; loss: number; lr: number}[]; recon: Asset; errors: Asset; metrics: {point_wise: Metrics; point_adjusted: Metrics; continuous_score_auc: number}; windowThreshold:number; run:string; coverage?:number[]; windows?:{chunks:WindowChunk[];count:number;dtype:string;maskDirectory:string}; examples?:{code:string;index:number;start:number;feature:number}[] };
export type Feature = { index: number; key: string; label: string; description: string };
export type Journey = {
  datasets: Record<string,Asset & {keys:string[];times:string[]}>; schemaVersion: number; resultVersion:string; dataset: string; window: number; features: Feature[]; times: string[]; labels: number[];
  segments: {start: number; end: number}[]; models: Model[]; input: Asset; cleanTest: Asset; labelMatrix: Asset; assets: Asset[];
  summary: {rawRows: number; rawFeatures: number; emptyFeatures: number; emptyRows: number; cleanRows: number; features: number; trainRows: number; testRows: number; anomalousRows: number; trainStart: string; trainEnd: string; testStart: string; testEnd: string; omittedTimes: string[]; cleanStart: string; cleanEnd: string};
  removedFeatures: string[]; missingExample: {feature: number; times: string[]; before: (number|null)[]; after: number[]; selected: number};
  normalization: {feature: number; trainMin: number; trainMax: number; testMin: number; testMax: number; raw: number[]; normalized: number[]}[];
  rawSampleRows: {time:string; values:(number|null)[]}[]; sampleFeatures: number[]; sampleRows: {time: string; values: number[]}[]; trainingSample: number[][]; provenance: Record<string,string>;
};
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const fmt=(n:number,digits=0)=>n.toLocaleString('zh-CN',{maximumFractionDigits:digits});
export const pct=(n:number|null)=>n===null?'—':`${(n*100).toFixed(2)}%`;
export function series(values:Float64Array,feature:number,start:number,length=64){return Array.from({length:Math.min(length,values.length/125-start)},(_,i)=>values[(start+i)*125+feature]);}
export function meanSeries(values:Float64Array|Float32Array,start=0,length=64,features=125){
 return Array.from({length:Math.min(length,values.length/features-start)},(_,i)=>{let sum=0;for(let f=0;f<features;f++)sum+=values[(start+i)*features+f];return sum/features});
}
export function countMetrics(labels:number[],scores:number[],threshold:number,start=0,end=labels.length):Metrics{
 let tp=0,fp=0,fn=0,tn=0;
 for(let i=start;i<end;i++){const y=labels[i]>0,p=scores[i]>threshold;if(y&&p)tp++;else if(p)fp++;else if(y)fn++;else tn++;}
 return{tp,fp,fn,tn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):null};
}
export function outcome(label:number,score:number,threshold:number){return label?(score>threshold?'检出异常':'漏检异常'):(score>threshold?'误报':'正确正常');}
export function pointAdjusted(labels:number[],scores:number[],threshold:number){const p=scores.map(v=>v>threshold);let i=0;while(i<labels.length){if(!labels[i]){i++;continue;}const start=i;while(i<labels.length&&labels[i])i++;if(p.slice(start,i).some(Boolean))p.fill(true,start,i);}return p;}
const assetCache=new Map<string,Promise<Float64Array>>();
export function loadAsset(asset:Asset){
 const existing=assetCache.get(asset.file);if(existing)return existing;
 const request=fetch(`${import.meta.env.BASE_URL}data/journey/${asset.file}?v=${asset.sha256}`).then(async r=>{if(!r.ok)throw Error('数据读取失败');const b=await r.arrayBuffer();if(b.byteLength!==asset.bytes)throw Error('数据文件长度不匹配');return new Float64Array(b);}).catch(e=>{assetCache.delete(asset.file);throw e;});
 assetCache.set(asset.file,request);return request;
}
const windowCache=new Map<string,Promise<ArrayBuffer>>();
async function windowFile(file:string,bytes:number){
 let request=windowCache.get(file);if(request)return request;
 request=fetch(`${import.meta.env.BASE_URL}data/journey/${file}?v=windows-v1-20261027`).then(async r=>{if(!r.ok)throw Error('窗口结果读取失败');const b=await r.arrayBuffer();if(b.byteLength!==bytes)throw Error('窗口文件长度不匹配');return b}).catch(e=>{windowCache.delete(file);throw e});
 windowCache.set(file,request);if(windowCache.size>10)windowCache.delete(windowCache.keys().next().value!);return request;
}
export async function loadWindow(m:Model,start:number){
 const pack=m.windows,chunk=pack?.chunks.find(c=>start>=c.start&&start<c.start+c.count);if(!pack||!chunk)throw Error('没有对应的完整窗口');
 const [raw,maskRaw]=await Promise.all([windowFile(chunk.file,chunk.bytes),windowFile(`${pack.maskDirectory}/${chunk.file.split('/').pop()}`,chunk.count*64*125)]);
 const offset=(start-chunk.start)*64*125;
 return {start,modelId:m.id,recon:new Float32Array(raw,offset*4,64*125).slice(),mask:new Uint8Array(maskRaw,offset,64*125).slice()};
}
export function windowScores(input:Float64Array,recon:Float32Array,start:number){return Array.from({length:64},(_,i)=>{let s=0;for(let j=0;j<125;j++)s+=(input[(start+i)*125+j]-recon[i*125+j])**2;return s/125})}
