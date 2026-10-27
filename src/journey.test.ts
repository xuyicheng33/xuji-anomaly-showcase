import {describe,it,expect} from 'vitest';
import {countMetrics,pointAdjusted,pageFromHash,lessons,stages,series,outcome} from './journey';
describe('journey navigation and numerical chain',()=>{
 it('covers all forty steps exactly once',()=>{expect(lessons.map(p=>p.id)).toEqual(Array.from({length:40},(_,i)=>i+1));expect(new Set(lessons.map(p=>p.title)).size).toBe(40);expect(lessons.every(p=>p.stage>=0)).toBe(true);expect(stages.flatMap(s=>lessons.filter(p=>p.id>=s.range[0]&&p.id<=s.range[1]))).toHaveLength(40);});
 it('validates direct routes',()=>{expect(pageFromHash('#/step/38')).toBe(38);for(const hash of ['#/step/41','#/step/-1','#/step/00','#/wat'])expect(pageFromHash(hash)).toBe(0);});
 it('keeps threshold equality normal and limits prefix statistics',()=>{const y=[0,1,1,0],s=[.5,.7,.2,.9];expect(countMetrics(y,s,.5)).toEqual({tp:1,fp:1,fn:1,tn:1,precision:.5,recall:.5,f1:.5});expect(countMetrics(y,s,.5,0,1)).toEqual({tp:0,fp:0,fn:0,tn:1,precision:null,recall:null,f1:null});});
 it('does not apply point adjustment to live decisions',()=>{expect(pointAdjusted([0,1,1,1,0],[0,0,1,0,0],.5)).toEqual([false,true,true,true,false]);expect(outcome(1,0,.5)).toBe('漏检异常');});
 it('reads row-major arrays without mixing feature dimensions',()=>{const a=Float64Array.from({length:375},(_,i)=>i);expect(series(a,124,1,2)).toEqual([249,374]);});
});
