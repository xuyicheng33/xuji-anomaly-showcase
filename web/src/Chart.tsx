import {useEffect,useRef} from 'react';
import * as echarts from 'echarts/core';
import {LineChart,BarChart,HeatmapChart,ScatterChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent,MarkAreaComponent,VisualMapComponent,AxisPointerComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
echarts.use([LineChart,BarChart,HeatmapChart,ScatterChart,GridComponent,TooltipComponent,LegendComponent,DataZoomComponent,MarkLineComponent,MarkAreaComponent,VisualMapComponent,AxisPointerComponent,CanvasRenderer]);
export type Option=echarts.EChartsCoreOption;
export function Chart({option,height=300,onClick}:{option:Option;height?:number;onClick?:(index:number)=>void}){
 const div=useRef<HTMLDivElement>(null);const instance=useRef<echarts.ECharts|undefined>(undefined);
 useEffect(()=>{const chart=echarts.init(div.current!,undefined,{renderer:'canvas',devicePixelRatio:Math.min(devicePixelRatio,2)});instance.current=chart;
  const resize=new ResizeObserver(()=>chart.resize());resize.observe(div.current!);
  return()=>{resize.disconnect();chart.dispose();};
 },[]);
 useEffect(()=>{instance.current?.setOption(option,{notMerge:true,lazyUpdate:true});},[option]);
 useEffect(()=>{if(!onClick)return;const cb=(e:unknown)=>{const ev=e as {dataIndex:number};onClick(ev.dataIndex);};instance.current?.on('click',cb);return()=>{instance.current?.off('click',cb);};},[onClick]);
 return <div className="chart" ref={div} style={{height}} role="img" aria-label="交互数据图表"/>;
}
export const colors={ink:'#646057',input:'#959086',recon:'#2c5282',score:'#6b46c1',alarm:'#c94a29',label:'#d97706',normal:'#2d6a4f'};
export function lines(series:{name:string;data:(number|null)[];color:string}[],extra:Option={}):Option{
 return {animation:false,grid:{left:58,right:22,top:42,bottom:42},tooltip:{trigger:'axis',confine:true},legend:{top:0,left:8,textStyle:{color:'#66635c'}},
 xAxis:{type:'category',boundaryGap:false,axisLine:{lineStyle:{color:'#ddd9ce'}},axisLabel:{color:'#746f65'}},
 yAxis:{type:'value',scale:true,splitNumber:3,axisLabel:{color:'#746f65',formatter:(v:number)=>Number(v.toPrecision(3))},splitLine:{lineStyle:{color:'#f0eee7'}}},
 series:series.map(s=>({name:s.name,type:'line',data:s.data,itemStyle:{color:s.color},showSymbol:false,lineStyle:{width:1.8},connectNulls:false})),...extra};
}

