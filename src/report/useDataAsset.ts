import {useEffect,useState} from 'react';
import {loadAsset,type Asset} from '../journey';

/** Keep shared file caching, but only request assets used by the current view. */
export function useDataAsset(asset:Asset|null){
 const key=asset?.file??'';
 const [state,setState]=useState<{key:string;data:Float64Array|null;error:string}>({key:'',data:null,error:''});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!asset)return;
  let active=true;
  setState(previous=>({key,data:previous.key===key?previous.data:null,error:''}));
  loadAsset(asset).then(data=>{if(active)setState({key,data,error:''})}).catch(()=>{if(active)setState({key,data:null,error:'数据读取失败。'})});
  return()=>{active=false};
 },[key,attempt]);
 return {data:state.key===key?state.data:null,error:state.key===key?state.error:'',retry:()=>setAttempt(n=>n+1)};
}
