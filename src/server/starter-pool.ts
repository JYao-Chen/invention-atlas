import {randomUUID} from 'node:crypto';
import type {StarterPool,Patent} from '@/lib/types';
import {analysisPatents,setting,dataset} from './db';
import {starterCandidates,generateStarters} from './starters';

const jobs=new Map<string,Promise<void>>();
const key=(id:string)=>'starter-pool:'+id;
function saved(id:string):StarterPool|undefined{const value=setting(key(id));return value?JSON.parse(value):undefined;}
export function readyStarterPool(id:string,consumed:string[]=[]):StarterPool{
 if(!dataset(id))throw new Error('数据集不存在');
 const pool=saved(id)||{version:randomUUID(),batches:[]};
 pool.batches=pool.batches.filter(b=>!consumed.includes(b.id));
 if(pool.batches.length<3){const records=analysisPatents(id);while(pool.batches.length<3){const previous=pool.batches.at(-1)?.items.map(i=>i.name)||[];const items=starterCandidates(records,id,previous);if(!items.length)break;pool.batches.push({id:randomUUID(),items});}}
 setting(key(id),JSON.stringify(pool));return pool;
}
// Only reserve batches are refined. Displayed batches keep their wording and bound parameters.
export function warmStarterPool(id:string,write=generateStarters):Promise<void>{
 const initial=saved(id);if(!initial)return Promise.resolve();const jobKey=id+':'+initial.version;
 const pending=jobs.get(jobKey);if(pending)return pending;
 const job=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{let records:Patent[]|undefined;for(let count=0;count<3;count++){
  const pool=saved(id);if(!pool||pool.version!==initial.version||!dataset(id))return;
  const batch=pool.batches.find(b=>b.generated===undefined);if(!batch)return;
  records??=analysisPatents(id);const result=await write(records,id,[],()=>{},undefined,undefined,batch.items);
  const current=saved(id);if(!current||current.version!==initial.version)return;
  const target=current.batches.find(b=>b.id===batch.id);if(target){target.items=result.items;target.generated=result.generated;setting(key(id),JSON.stringify(current));}
 }}).catch(()=>{}).finally(()=>jobs.delete(jobKey));jobs.set(jobKey,job);return job;
}
