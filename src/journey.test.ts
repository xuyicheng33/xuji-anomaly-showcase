import {describe,it,expect} from 'vitest';
import {countMetrics,pointAdjusted,series,outcome} from './journey';
describe('journey navigation and numerical chain',()=>{
 it('keeps threshold equality normal and limits prefix statistics',()=>{const y=[0,1,1,0],s=[.5,.7,.2,.9];expect(countMetrics(y,s,.5)).toEqual({tp:1,fp:1,fn:1,tn:1,precision:.5,recall:.5,f1:.5});expect(countMetrics(y,s,.5,0,1)).toEqual({tp:0,fp:0,fn:0,tn:1,precision:null,recall:null,f1:null});});
 it('does not apply point adjustment to live decisions',()=>{expect(pointAdjusted([0,1,1,1,0],[0,0,1,0,0],.5)).toEqual([false,true,true,true,false]);expect(outcome(1,0,.5)).toBe('漏检异常');});
 it('reads row-major arrays without mixing feature dimensions',()=>{const a=Float64Array.from({length:375},(_,i)=>i);expect(series(a,124,1,2)).toEqual([249,374]);});
});
