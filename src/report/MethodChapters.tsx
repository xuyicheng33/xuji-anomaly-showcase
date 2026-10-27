import {useEffect,useMemo,useState} from 'react';
import {loadAsset,type Journey,type Arrays,type Model} from '../journey';
import {Heading,Section,Note,ModelSelect,colors} from './ReportUI';
import Curve from './Curve';
import './chapters.css';

const descriptions={
 model1:{title:'局部与全局时间特征融合',intro:'STAM-AD融合局部与全局时间特征，重建输入序列。',details:[['双分支特征提取','局部分支提取短期变化，全局分支建模窗口内的整体规律。'],['掩码学习','全局分支遮蔽部分连续记录，学习上下文关联。'],['差异化训练目标','降低正常位置的重建误差，保留异常位置的重建差异。']],image:'stam.png'},
 model2:{title:'多尺度时间特征融合',intro:'SMST-AD融合多尺度时间特征，训练中加入空间注意力约束。',details:[['多尺度特征提取','多个局部分支提取不同时间范围的波动与趋势。'],['时间特征融合','融合局部与全局时间表示，生成窗口重建结果。'],['空间注意力约束','在训练损失中加入正则项，学习测点关联。']],image:'smst.png'}
};
function modelInScope(data:Journey,model:Model){return model.id==='model1'||model.id==='model2'?model:data.models.find(m=>m.id==='model1')!}

export function ModelsChapter({data,model,setModel}:{data:Journey;model:Model;setModel:(value:string)=>void}){
 const current=modelInScope(data,model),multi=current.id==='model2',description=descriptions[multi?'model2':'model1'];
 return <div className="chapter-refined models-chapter">
  <Heading number="03" title="异常检测模型">基于序列重建误差识别异常。</Heading>
  <div className="model-selection-row"><ModelSelect data={data} value={current.id} onChange={setModel}/></div>
  <div className="model-intro"><span>{current.name}</span><h2>{description.title}</h2><p>{description.intro}</p></div>
  <div className="model-details">{description.details.map(([title,text],i)=><section key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></section>)}</div>

  <Section title="模型特征对比">
   <div className="model-comparison"><div><span>STAM-AD</span><h3>局部 + 全局时间</h3></div><div><span>SMST-AD</span><h3>多尺度时间 + 空间注意力约束</h3></div></div>

  </Section>

 </div>;
}

type TrainingProps={data:Journey;arrays?:Arrays;model:Model;setModel:(value:string)=>void;feature?:number;setFeature?:(value:number)=>void};
export function TrainingChapter({data,model,setModel,feature:sharedFeature,setFeature:shareFeature}:TrainingProps){
 const [localFeature,setLocalFeature]=useState(4),[windowStart,setWindowStart]=useState(Math.min(5299,data.datasets.train.shape[0]-64)),[epoch,setEpoch]=useState(0);
 const [training,setTraining]=useState<Float64Array|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const feature=sharedFeature??localFeature,point=data.features.find(f=>f.index===feature)??data.features[4],train=data.datasets.train,current=modelInScope(data,model);
 const chooseFeature=(value:number)=>{setLocalFeature(value);shareFeature?.(value)};
 useEffect(()=>{let active=true;setError('');loadAsset(train).then(values=>{if(active)setTraining(values)}).catch(()=>{if(active)setError('训练数据暂未读取成功。')});return()=>{active=false}},[train,attempt]);
 const stats=useMemo(()=>{if(!training)return null;let min=Infinity,max=-Infinity;const col=train.keys.indexOf(point.key);for(let i=0;i<train.shape[0];i++){const value=training[i*train.keys.length+col];if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value)}}return {min,max,col}},[training,train,point.key]);
 const length=train.shape[0],lastStart=Math.max(0,length-64),start=Math.min(Math.max(0,windowStart),lastStart),contextLength=Math.min(192,length),contextStart=Math.max(0,Math.min(start-64,length-contextLength));
 const values=training&&stats?Array.from({length:contextLength},(_,i)=>{const value=training[(contextStart+i)*train.keys.length+stats.col];return stats.max===stats.min?0:(value-stats.min)/(stats.max-stats.min)}):[];
 const activeEpoch=Math.min(epoch,current.history.length-1),record=current.history[activeEpoch];
 return <div className="chapter-refined training-chapter">
  <Heading number="04" title="模型训练过程">以 64 × 125 数据窗口为输入，通过重建损失优化模型参数。</Heading>
  <Section title="训练数据窗口">
   <div className="training-window-header"><label className="field">显示测点<select aria-label="训练测点" value={point.index} onChange={e=>chooseFeature(+e.target.value)}>{data.features.map(f=><option key={f.index} value={f.index}>{f.label} · {f.key}</option>)}</select></label><span>训练集 · {length.toLocaleString('zh-CN')} 个时刻</span></div>
   <div className="chapter-chart-panel">
    {error?<div className="chapter-loading" role="alert"><p>{error}</p><button onClick={()=>setAttempt(value=>value+1)}>重新读取</button></div>:training&&stats?<><div className="chart-context"><span>选定窗口 · 64 点</span><span>{train.times[start]} — {train.times[start+63]}</span></div><Curve title="归一化训练数据" lines={[{name:point.label,values,color:colors.input}]} times={train.times.slice(contextStart,contextStart+contextLength)} labels={values.map((_,i)=>Number(contextStart+i>=start&&contextStart+i<start+64))} range={[0,1]} height={260}/><label className="slider-label">移动窗口<input aria-label="训练窗口位置" type="range" min="0" max={lastStart} value={start} onChange={e=>setWindowStart(+e.target.value)}/><span>{start+1}—{start+64}</span></label><div className="window-position-actions"><button onClick={()=>setWindowStart(0)} disabled={start===0}>首个窗口</button><button onClick={()=>setWindowStart(value=>Math.max(0,value-1))} disabled={start===0}>前移 1 点</button><button onClick={()=>setWindowStart(value=>Math.min(lastStart,value+1))} disabled={start===lastStart}>后移 1 点</button><button onClick={()=>setWindowStart(lastStart)} disabled={start===lastStart}>末个窗口</button></div></>:<p className="chapter-loading" role="status">正在读取真实训练数据…</p>}
   </div>
   <div className="window-rules"><div><strong>64 × 125</strong><span>每个窗口的输入形状</span></div><div><strong>{(lastStart+1).toLocaleString('zh-CN')}</strong><span>步长为 1 时的完整窗口数</span></div></div>
   <Note title="窗口设置"><p>训练阶段在序列开头重复首个观测值补齐窗口；评估阶段遍历完整窗口，按实际覆盖次数合并。</p></Note>
  </Section>
  <Section title="参数优化流程">
   <ol className="training-steps">{[['输入窗口','输入数据、标签与掩码。'],['序列重建','根据当前参数生成重建结果。'],['损失计算','计算重建差异及模型约束。'],['参数更新','通过反向传播优化模型参数。']].map(([title,text],i)=><li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
  </Section>
  <Section title="训练损失与学习率">
   <div className="model-selection-row"><ModelSelect data={data} value={current.id} onChange={value=>{setModel(value);setEpoch(0)}}/><p>{current.history.length} 轮训练</p></div>
   <div className="chapter-chart-panel"><Curve axisUnit="轮" title="训练损失" lines={[{name:current.name,values:current.history.map(item=>item.loss),color:colors.input}]} selected={activeEpoch} height={245} onSelect={setEpoch}/><label className="slider-label">轮次<input aria-label="训练轮次" type="range" min="0" max={current.history.length-1} value={activeEpoch} onChange={e=>setEpoch(+e.target.value)}/><span>{record?.epoch??activeEpoch+1} / {current.history.length}</span></label></div>
   {record&&<div className="training-metrics inline-facts"><strong>{record.loss.toFixed(5)}<span>当前轮次损失</span></strong><strong>{record.lr.toExponential(2)}<span>当前学习率</span></strong><strong>{current.history.length}<span>训练轮次</span></strong></div>}

  </Section>


 </div>;
}
