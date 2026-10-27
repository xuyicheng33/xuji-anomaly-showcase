import {useEffect,useMemo,useState} from 'react';
import {loadAsset,type Journey,type Arrays,type Model} from '../journey';
import {Heading,Section,Note,ModelSelect,colors} from './ReportUI';
import Curve from './Curve';
import './chapters.css';

const descriptions={
 model1:{title:'双分支自监督重建',intro:'STAM-AD以TCN与Transformer为主体，结合异常增强、时间掩码和有界异常损失，学习正常模式与异常变化之间的差异。',
 details:[['局部时间依赖','Local分支接收完整窗口，通过因果卷积提取短期变化，再由Transformer组织窗口内的时间关联。'],['全局时间依赖','Global分支接收部分遮蔽的窗口，通过空洞卷积扩大感受野，结合Transformer提取较长范围的规律。'],['融合与重建','拼接局部与全局特征，由共享解码器还原窗口。重建结果与输入逐点比较，形成异常评分。']]},
 model2:{title:'多尺度时间依赖建模',intro:'SMST-AD在双分支框架上扩展局部时间建模，以多个感受野并行观察序列，兼顾突发波动、局部节奏与较长范围的趋势。',
 details:[['多尺度局部编码','空洞率为1、2、4的Local TCN并行提取特征，每个尺度配置独立Transformer，保留不同时间粒度的信息。'],['时间特征融合','先融合各个局部尺度，再与Global分支的特征拼接，形成兼顾局部与整体的窗口表示。'],['自监督区分学习','沿用异常增强、时间掩码与有界异常损失，通过构造标签引导模型区分正常与异常。']]}
};
function modelInScope(data:Journey,model:Model){return model.id==='model1'||model.id==='model2'?model:data.models.find(m=>m.id==='model1')!}

export function ModelsChapter({data,model,setModel}:{data:Journey;model:Model;setModel:(value:string)=>void}){
 const current=modelInScope(data,model),multi=current.id==='model2',description=descriptions[multi?'model2':'model1'];
 return <div className="chapter-refined models-chapter">
  <Heading title="异常检测模型">以窗口重建为基础，识别偏离正常模式的时间片段。</Heading>
  <div className="model-selection-row"><ModelSelect data={data} value={current.id} onChange={setModel}/></div>
  <div className="model-intro"><span>{current.name}</span><h2>{description.title}</h2><p>{description.intro}</p></div>
  <div className="model-details">{description.details.map(([title,text],i)=><section key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></section>)}</div>

  <Section title="从输入到异常评分">
   <div className="model-flow" aria-label="模型处理流程">{[['输入窗口','64个时刻 × 125个测点'],[multi?'多尺度与全局编码':'局部与全局编码','TCN提取变化，Transformer学习关联'],['特征融合与重建','还原各时刻的测点数值'],['误差聚合与判定','平方误差聚合为时刻分数']].map(([title,copy],i)=><div key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p></div>)}</div>
  </Section>

  <Section title="时间掩码与上下文学习">
   <div className="model-explanation"><div><h3>在部分可见信息中学习规律</h3><p>通过频域分析观察各测点的周期性，再对Global分支输入中的连续片段进行遮蔽，促使模型利用其余可见时刻建立时间关联。Local分支保留完整输入，补充细节。</p></div><div className="mask-example" aria-label="64点窗口中连续16点遮蔽"><div className="mask-example-top"><span>Global分支输入</span><strong>64 点</strong></div><div className="mask-example-cells">{Array.from({length:64},(_,i)=><i key={i} className={i>=22&&i<38?'masked':''}/>)}</div><div className="mask-example-key"><span>保留可见记录</span><span>连续遮蔽 16 点</span></div><p>遮蔽后的窗口与完整窗口分别进入两个分支。</p></div></div>
  </Section>

  <Section title="有界异常损失">
   <p className="reading-copy">人为构造异常并生成标签，让正常与异常位置具有不同的训练目标。</p>
   <div className="loss-explanation"><div><span>正常位置</span><h3>减小重建误差</h3><p>持续拉近输入与重建结果，使模型准确还原正常模式。</p></div><div><span>异常位置</span><h3>形成足够的重建差异</h3><p>误差低于设定边界时推动其增大；达到边界后停止继续推动，使训练保持稳定。</p></div></div>
  </Section>

  <Section title="两种方法的侧重点">
   <div className="model-comparison"><div><span>STAM-AD</span><h3>局部与全局互补</h3><p>用两个时间分支分别捕捉短期变化与窗口整体规律。</p></div><div><span>SMST-AD</span><h3>多个时间尺度协同</h3><p>将局部建模细分为多个尺度，再与全局信息融合。</p></div></div>
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
    {error?<div className="chapter-loading" role="alert"><p>{error}</p><button onClick={()=>setAttempt(value=>value+1)}>重新读取</button></div>:training&&stats?<><div className="chart-context"><span>选定窗口 · 64 点</span><span>{train.times[start]} — {train.times[start+63]}</span></div><Curve title="归一化训练数据" lines={[{name:point.label,values,color:colors.input}]} times={train.times.slice(contextStart,contextStart+contextLength)} labels={values.map((_,i)=>Number(contextStart+i>=start&&contextStart+i<start+64))} height={260}/><label className="slider-label">移动窗口<input aria-label="训练窗口位置" type="range" min="0" max={lastStart} value={start} onChange={e=>setWindowStart(+e.target.value)}/><span>{start+1}—{start+64}</span></label><div className="window-position-actions"><button onClick={()=>setWindowStart(0)} disabled={start===0}>首个窗口</button><button onClick={()=>setWindowStart(value=>Math.max(0,value-1))} disabled={start===0}>前移 1 点</button><button onClick={()=>setWindowStart(value=>Math.min(lastStart,value+1))} disabled={start===lastStart}>后移 1 点</button><button onClick={()=>setWindowStart(lastStart)} disabled={start===lastStart}>末个窗口</button></div></>:<p className="chapter-loading" role="status">正在读取真实训练数据…</p>}
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
