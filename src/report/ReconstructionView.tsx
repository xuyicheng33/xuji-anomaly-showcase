import Curve from './Curve';
import {colors} from './ReportUI';

export default function ReconstructionView({input,recon,rms,aggregate,labels,selected,reveal,start=0,onSelect,compact=false}:{input:number[];recon?:number[];rms?:number[];aggregate:boolean;labels:number[];selected?:number;reveal?:number;start?:number;onSelect?:(n:number)=>void;compact?:boolean}){
 return <div className={'reconstruction-view'+(aggregate?' aggregate-view':'')}>
  <Curve title={aggregate?'125 测点平均曲线':'测点输入与重建'} lines={[{name:aggregate?'平均输入':'测试输入',values:input,color:colors.input},...(recon?[{name:aggregate?'平均重建':'模型重建',values:recon,color:colors.recon}]:[])]} labels={labels} selected={selected} reveal={reveal} start={start} onSelect={onSelect} height={compact?145:220}/>
  {aggregate&&rms&&<div className="aggregate-error"><Curve title="整体重建误差" lines={[{name:'均方根误差',values:rms,color:colors.score}]} labels={labels} selected={selected} reveal={reveal} start={start} onSelect={onSelect} height={compact?100:130}/><p>分数 = 均方根误差²<span>误差平方 → 125 测点平均 → 开方</span></p></div>}
 </div>;
}
