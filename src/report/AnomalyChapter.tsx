import {useState} from 'react';
import {series,type Journey,type Arrays} from '../journey';
import {Heading,Section,Note,Next,FeatureSelect,colors} from './ReportUI';
import Curve from './Curve';
const types=[{name:'软替换',desc:'按设定比例融合参考片段与原始片段。',image:'anomaly-soft.png'},{name:'均匀替换',desc:'将连续记录替换为固定值，形成平台异常。',image:'anomaly-uniform.png'},{name:'峰值噪声',desc:'改变局部数值形成尖峰，并标记邻域。',image:'anomaly-peak.png'},{name:'长度调整',desc:'压缩或拉长局部片段，改变变化速率。',image:'anomaly-length.png'}];
export default function AnomalyChapter({data,arrays,feature,setFeature,setStart}:{data:Journey;arrays:Arrays;feature:number;setFeature:(n:number)=>void;setStart:(n:number)=>void}){
 const [localFeature,setLocalFeature]=useState(4);const selectedFeature=localFeature;
 const [type,setType]=useState(0),[mode,setMode]=useState('static'),[round,setRound]=useState(1),[enabled,setEnabled]=useState(false),[amount,setAmount]=useState(65),[point,setPoint]=useState(24);
 const base=series(arrays.clean,selectedFeature,175),a=mode==='static'?18:10+((round-1)*7)%22,b=a+20;
 const labels=base.map((_,i)=>enabled?Number(type===2?Math.abs(i-(a+10))<=4:i>=a&&i<b):0);
 const after=base.map((v,i)=>{if(!enabled||i<a||i>=b)return v;if(type===0){const taper=Math.min(1,(i-a)/2,(b-1-i)/2);return v*(1-amount/100*taper)+base[(i+24+round)%64]*amount/100*taper}if(type===1)return amount/100;if(type===2)return i===a+10?v+amount/100:v;const pos=a+(i-a)*(amount>50?.5:1.8),j=Math.min(b-1,Math.floor(pos)),k=Math.min(b-1,j+1);return base[j]+(base[k]-base[j])*(pos-j)});
 const reset=()=>{setEnabled(false);setRound(1)};
 return <div className="anomaly-page"><Heading number="02" title="异常样本构造">在指定位置构造异常并生成标签，用于模型训练与检测评估。</Heading>
 <div className="anomaly-tabs" role="tablist" aria-label="异常类型">{types.map((t,i)=><button role="tab" aria-selected={type===i} key={t.name} onClick={()=>{setType(i);reset()}}><span>0{i+1}</span>{t.name}</button>)}</div>
 <div className="anomaly-intro"><h2>{types[type].name}</h2><p>{types[type].desc}</p></div>
 <div className="experiment"><div className="toolbar"><FeatureSelect data={data} value={selectedFeature} onChange={n=>{setLocalFeature(n);reset()}}/><div className="segmented" aria-label="插入方式"><button aria-pressed={mode==='static'} onClick={()=>{setMode('static');reset()}}>静态插入</button><button aria-pressed={mode==='dynamic'} onClick={()=>{setMode('dynamic');reset()}}>动态插入</button></div></div>
 <Curve title="插入前后" lines={[{name:'插入前',values:base,color:colors.muted},{name:'插入后',values:after,color:colors.input}]} labels={labels} selected={enabled?point:undefined} onSelect={setPoint} height={220}/>
 <div className="label-track"><span>当前测点标签 <small>0 未插入 · 1 插入异常</small></span><div aria-label={'异常标签共'+labels.reduce((s,v)=>s+v,0)+'点'}>{labels.map((v,i)=><button key={i} className={v?'marked':''} style={{left:(i/63*100)+'%'}} aria-label={'查看第'+(i+1)+'点，标签'+v} aria-pressed={point===i} onClick={()=>setPoint(i)}/>)}</div></div>
 <div className="toolbar experiment-controls"><label className="slider-label">{['混合比例','替换数值','尖峰幅度','变化速度'][type]}<input type="range" min="10" max="90" value={amount} aria-label="异常参数" onChange={e=>{setAmount(+e.target.value);reset()}}/><span>{type===3?(amount>50?'放慢':'加快'):amount/100}</span></label><button className="primary" disabled={enabled&&mode==='static'} onClick={()=>{setEnabled(true);setPoint(type===2?a+10:a+5);if(enabled&&mode==='dynamic')setRound(n=>n+1)}}>{!enabled?'插入异常':mode==='dynamic'?'生成下一轮':'已固定'} →</button><button className="text-button" onClick={reset}>还原</button></div>
 <p className="quiet">{mode==='static'?'固定插入位置':'动态插入 · 第 '+round+' 轮'}</p>
</div>
 <Section title="数据与标签对照"><div className="anomaly-point" aria-live="polite"><div><span>片段位置</span><strong>第 {point+1} 点</strong></div><div><span>插入前</span><strong>{base[point].toFixed(4)}</strong></div><div><span>插入后</span><strong>{after[point].toFixed(4)}</strong></div><div><span>当前测点标签</span><strong>{labels[point]}</strong></div></div>
 <p className="reading-copy">任一测点标签为 1，该时刻记为异常。</p>
 <Note title="局部记录明细"><div className="table-scroll"><table><thead><tr><th>片段位置</th><th>插入前</th><th>插入后</th><th>当前测点标签</th><th>相邻测点标签</th></tr></thead><tbody>{Array.from({length:6},(_,j)=>Math.max(0,Math.min(58,point-2))+j).map(i=><tr key={i} className={labels[i]?'changed-row':''}><td>第{i+1}点</td><td>{base[i].toFixed(4)}</td><td>{after[i].toFixed(4)}</td><td>{labels[i]}</td><td>0</td></tr>)}</tbody></table></div></Note></Section>
 <Section title="训练与测试样本"><div className="editorial-grid"><div><h3>训练异常</h3><p>每轮动态构造不同位置和形态的异常。</p></div><div><h3>测试异常</h3><p>固定输入与标签，统一评估两种方法。</p></div></div><div className="inline-facts"><strong>2,397 <span>测试时刻</span></strong><strong>490 <span>异常时刻</span></strong><strong>125 <span>测点标签列</span></strong></div>
 <a className="inline-link" href="#/detection" onClick={()=>{const e=data.models[0].examples?.find(e=>e.code==='tp');if(e){setStart(e.start);setFeature(e.feature)}}}>固定测试样本检测 →</a>
</Section><Next to="models" title="异常检测模型"/></div>
}
