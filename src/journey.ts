export type Asset = { file: string; shape: number[]; bytes: number; sha256: string };
export type Metrics = { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null; f1: number | null };
export type Model = { id: string; name: string; threshold: number; thresholdSource: string; scores: number[]; history: {epoch: number; loss: number; lr: number}[]; recon: Asset; errors: Asset; metrics: {point_wise: Metrics; point_adjusted: Metrics; continuous_score_auc: number} };
export type Feature = { index: number; key: string; label: string; description: string };
export type Journey = {
  datasets: Record<string,Asset & {keys:string[];times:string[]}>; schemaVersion: number; dataset: string; window: number; features: Feature[]; times: string[]; labels: number[];
  segments: {start: number; end: number}[]; models: Model[]; input: Asset; cleanTest: Asset; labelMatrix: Asset; assets: Asset[];
  summary: {rawRows: number; rawFeatures: number; emptyFeatures: number; emptyRows: number; cleanRows: number; features: number; trainRows: number; testRows: number; anomalousRows: number; trainStart: string; trainEnd: string; testStart: string; testEnd: string; omittedTimes: string[]; cleanStart: string; cleanEnd: string};
  removedFeatures: string[]; missingExample: {feature: number; times: string[]; before: (number|null)[]; after: number[]; selected: number};
  normalization: {feature: number; trainMin: number; trainMax: number; testMin: number; testMax: number; raw: number[]; normalized: number[]}[];
  rawSampleRows: {time:string; values:(number|null)[]}[]; sampleFeatures: number[]; sampleRows: {time: string; values: number[]}[]; trainingSample: number[][]; provenance: Record<string,string>;
};
export type Arrays = { input: Float64Array; clean: Float64Array; labels: Float64Array; recon: Float64Array; errors: Float64Array; modelId: string };
export const stages = [
  {name:'数据整理', desc:'从原始记录到研究数据集', range:[1,9], action:'数据怎样变成模型输入？'},
  {name:'异常构造', desc:'查看四类异常与标签的变化', range:[10,18], action:'异常加在哪里，怎样记录？'},
  {name:'三种模型', desc:'理解每种模型的处理方式', range:[19,25], action:'模型怎样学习数据规律？'},
  {name:'模型训练', desc:'从滑动窗口到训练完成的模型', range:[26,30], action:'模型参数怎样得到？'},
  {name:'测试评估', desc:'从重建误差到异常判定', range:[31,36], action:'检测结果怎样计算？'},
  {name:'检测演示', desc:'跟随真实片段查看完整过程', range:[37,40], action:'一段数据会得到什么结果？'},
];
const content = [
 ['认识原始文件','测点说明与监测记录通过测点编号对应。','raw'],
 ['浏览原始监测记录','每一行记录一个时刻，每一列记录一个测点。','raw'],
 ['移除全缺失测点','136个测点中，11个测点没有有效数值。','raw'],
 ['整理有效时间记录','沿时间排列有效记录，保留每条记录的时间。','cleaning'],
 ['填补缺失记录','查看原始缺失位置与整理表中的对应数值。','cleaning'],
 ['平滑局部波动','查看报告中平滑处理的步骤，理解局部波动怎样处理。','cleaning'],
 ['形成研究数据集','整理后的数据包含7,992个时刻、125个测点。','clean'],
 ['划分训练集与测试集','前段用于训练，后段用于测试，保持时间先后顺序。','mapping'],
 ['统一数值尺度','把不同量级的测点转换到统一的数值尺度。','normalization'],
 ['查看异常标签','标签与数据逐格对应：0表示正常，1表示插入异常。','results'],
 ['选定异常位置','先选一段时间和一个测点，再改变对应的数据。','results'],
 ['混入另一段变化','软替换将参考片段与原片段按比例混合。','anomaly'],
 ['替换为固定值','均匀替换把选中区间变成一段恒定数值。','anomaly'],
 ['加入尖峰','峰值噪声改变局部位置的数值，形成突变。','anomaly'],
 ['改变局部变化速度','长度调整拉长或压缩局部片段的变化过程。','anomaly'],
 ['区分训练与测试异常','训练按轮次重新生成异常，测试保留固定样本。','training'],
 ['拼回完整序列','异常插入完成后，将片段按原顺序拼回序列。','anomaly'],
 ['保存测试样本','三种模型使用同一份测试输入和异常标签。','results'],
 ['从重建差异识别异常','模型输出重建值，输入与重建之间的差异用于评分。','reconstruction'],
 ['STAM-AD：结合局部与整体变化','两个分支分别观察局部变化和较长范围的规律。','models'],
 ['STAM-AD：选择信息并学习差异','自适应掩码选择信息，训练目标区分正常与构造异常。','models'],
 ['SMST-AD：观察多个时间尺度','多个时间分支同时处理不同范围的变化。','models'],
 ['SMST-AD：学习测点之间的关系','空间分支处理测点之间的关联。','models'],
 ['STMem-AD：保存正常模式','不同分支保存对应的正常模式，用于后续重建。','models'],
 ['STMem-AD：调用记忆辅助重建','输入匹配记忆中的模式，再得到重建结果。','models'],
 ['用滑动窗口组织输入','每次取连续64个时刻，让模型同时看到一段变化。','window'],
 ['补齐窗口边界','历史长度不足64时，重复首个观测值补齐窗口。','window'],
 ['完成一次参数更新','输入样本、计算重建与损失，再更新模型参数。','training'],
 ['查看训练过程','曲线来自模型检查点保存的训练记录。','training'],
 ['保存训练完成的模型','训练结果包含网络参数与推理所需的配置和状态。','training'],
 ['查看测试重建结果','查看一段真实测试输入及其已保存的重建结果。','reconstruction'],
 ['合并重叠窗口的误差','同一时刻被多个窗口覆盖，将对应误差取平均。','reconstruction'],
 ['汇总为异常分数','对同一时刻125个测点的平均误差再取平均。','reconstruction'],
 ['用阈值划分异常','异常分数超过该模型的阈值时，标记为异常。','threshold'],
 ['对照标签检查判定','把模型判定与插入标签对应，统计检出、误报与漏检。','results'],
 ['比较三种模型结果','在同一份测试数据上，查看各模型的归档评估结果。','threshold'],
 ['选择一段测试数据','选择模型和真实片段，开始查看一次检测过程。','window'],
 ['跟随窗口完成检测','依次查看输入、模型重建、误差、分数和判定。','reconstruction'],
 ['比较完整测试结果','保持时间片段不变，对比三种模型的异常分数。','threshold'],
 ['查看完整检测结果','对选中片段逐点统计，定位检出、误报和漏检的位置。','results'],
];
export const lessons = content.map(([title,description,source],i)=>({id:i+1,title,description,source,stage:stages.findIndex(s=>i+1>=s.range[0]&&i+1<=s.range[1])}));
export function pageFromHash(hash:string){const m=/^#[/]step[/]([0-9]+)$/.exec(hash);return m&&Number(m[1])>=1&&Number(m[1])<=40?Number(m[1]):0;}
export const stepHref=(id:number)=>id?`#/step/${String(id).padStart(2,'0')}`:'#/';
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const fmt=(n:number,digits=0)=>n.toLocaleString('zh-CN',{maximumFractionDigits:digits});
export const pct=(n:number|null)=>n===null?'—':`${(n*100).toFixed(2)}%`;
export function series(values:Float64Array,feature:number,start:number,length=64){return Array.from({length:Math.min(length,values.length/125-start)},(_,i)=>values[(start+i)*125+feature]);}
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
 const request=fetch(`${import.meta.env.BASE_URL}data/journey/${asset.file}`).then(async r=>{if(!r.ok)throw Error('数据读取失败');const b=await r.arrayBuffer();if(b.byteLength!==asset.bytes)throw Error('数据文件长度不匹配');return new Float64Array(b);}).catch(e=>{assetCache.delete(asset.file);throw e;});
 assetCache.set(asset.file,request);return request;
}
export async function loadArrays(d:Journey,m:Model):Promise<Arrays>{const [input,clean,labels,recon,errors]=await Promise.all([loadAsset(d.input),loadAsset(d.cleanTest),loadAsset(d.labelMatrix),loadAsset(m.recon),loadAsset(m.errors)]);return{input,clean,labels,recon,errors,modelId:m.id};}
