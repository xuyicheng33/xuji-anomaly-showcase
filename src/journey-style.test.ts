import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const css=readFileSync('src/journey.css','utf8');
describe('showcase design constraints',()=>{
 it('uses three type sizes with a twelve pixel minimum',()=>{
  const sizes=[...css.matchAll(/font-size:([0-9]+)px/g)].map(m=>Number(m[1]));
  expect([...new Set(sizes)].sort((a,b)=>a-b)).toEqual([12,16,32]);
 });
 it('uses Radix colors without custom hex values',()=>{
  for(const file of ['src/journey.css','src/JourneyLessons.tsx','src/JourneyVisuals.tsx','src/DatasetBrowser.tsx','src/FullResults.tsx'])expect(readFileSync(file,'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}/);
 });
 it('removes middle dots from active interface copy',()=>{
  for(const file of ['src/App.tsx','src/journey.ts','src/JourneyLessons.tsx','src/JourneyVisuals.tsx','src/DatasetBrowser.tsx','src/FullResults.tsx','index.html'])expect(readFileSync(file,'utf8')).not.toContain('·');
 });
 it('keeps CSS borders at half a pixel',()=>{
  const widths=[...css.matchAll(/border(?:-top|-bottom|-left|-right)?:([0-9.]+)px/g)].map(m=>Number(m[1]));
  expect(widths.length).toBeGreaterThan(10);expect(widths.every(w=>w===0.5)).toBe(true);
 });
});
