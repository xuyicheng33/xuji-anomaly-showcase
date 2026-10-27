import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {Theme} from '@radix-ui/themes';
import {describe,it,expect} from 'vitest';
import JourneyLessons from './JourneyLessons';
import {lessons,countMetrics,type Journey,type Arrays} from './journey';
const data=JSON.parse(readFileSync('public/data/journey/manifest.json','utf8')) as Journey;
const read=(name:string)=>{const b=readFileSync('public/data/journey/'+name);return new Float64Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const common={input:read(data.input.file),clean:read(data.cleanTest.file),labels:read(data.labelMatrix.file)};
describe('research-backed lesson pages',()=>{
 for(const model of data.models){
  const arrays:Arrays={...common,modelId:model.id,recon:read(model.recon.file),errors:read(model.errors.file)};
  it(model.name+' renders forty populated steps at the last valid window',()=>{
   for(const lesson of lessons){
    const html=renderToStaticMarkup(<Theme><JourneyLessons id={lesson.id} data={data} arrays={arrays} model={model} setModel={()=>{}} feature={124} setFeature={()=>{}} start={2333} setStart={()=>{}} go={()=>{}}/></Theme>);
    expect(html.length,lesson.title).toBeGreaterThan(300);
    expect(html,lesson.title).not.toMatch(/NaN|undefined|Infinity/);
   }
  });
  it(model.name+' matches every archived score and confusion count',()=>{
   for(let i=0;i<data.times.length;i++){
    let sum=0;for(let j=0;j<125;j++)sum+=arrays.errors[i*125+j];
    expect(sum/125).toBeCloseTo(model.scores[i],12);
   }
   const got=countMetrics(data.labels,model.scores,model.threshold);
   for(const key of ['tp','fp','fn','tn'] as const)expect(got[key]).toBe(model.metrics.point_wise[key]);
  });
 }
});
