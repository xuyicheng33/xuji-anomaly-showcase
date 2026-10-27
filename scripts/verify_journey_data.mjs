import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/data/journey/',import.meta.url);
const data=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
assert.equal(data.schemaVersion,2);
assert.equal(data.features.length,125);
assert.equal(data.times.length,2397);
assert.equal(data.labels.reduce((a,b)=>a+b,0),490);
const arrays=new Map();
for(const asset of [...data.assets,...Object.values(data.datasets)]){
 const bytes=await readFile(new URL(asset.file,root));
 assert.equal(bytes.length,asset.bytes,asset.file);
 assert.equal(bytes.length,asset.shape.reduce((a,b)=>a*b,8),asset.file);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);
 const values=new Float64Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.ok(values.every(v=>Number.isFinite(v)||(asset.file===data.datasets.raw.file&&Number.isNaN(v))),asset.file);arrays.set(asset.file,values);
}
for(const model of data.models){
 const errors=arrays.get(model.errors.file);let tp=0,fp=0,fn=0,tn=0;
 for(let i=0;i<data.times.length;i++){
  let sum=0;for(let j=0;j<125;j++)sum+=errors[i*125+j];
  assert.ok(Math.abs(sum/125-model.scores[i])<1e-12,model.id+' score '+i);
  const p=model.scores[i]>model.threshold,y=data.labels[i]>0;
  if(p&&y)tp++;else if(p)fp++;else if(y)fn++;else tn++;
 }
 for(const [key,value] of Object.entries({tp,fp,fn,tn}))assert.equal(value,model.metrics.point_wise[key],model.id+' '+key);
 assert.ok(model.history.every(h=>Number.isFinite(h.loss)&&Number.isFinite(h.lr)));
}
console.log('[PASS] 12 asset hashes, 7,191 model scores, labels and archived metrics');
