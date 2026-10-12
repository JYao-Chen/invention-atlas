import {test} from 'node:test';
import assert from 'node:assert/strict';
import {postgresPool} from '../src/server/postgres';
import {PostgresStore} from '../src/server/postgres-store';
import {ChunkStore} from '../src/server/chunk-store';
import {indexFulltext} from '../src/server/fulltext-index';
import {normalize,datasetMeta} from '../src/server/importers';

test('fulltext index preserves completed batches and resumes without reembedding them',async()=>{
 const pool=postgresPool(process.env.DATABASE_URL),business=new PostgresStore(pool),store=new ChunkStore(pool);
 try{
  const records=Array.from({length:12},(_,i)=>normalize({id:'US'+(3000+i)+'B1',abstract:'Network authentication fixture'},'TEST'));
  const meta=datasetMeta('index fixture',records,'fixture','fixture');await business.saveDataset(meta,records);
  let calls=0;const progress:unknown[]=[];
  const options={store,datasetId:meta.id,version:'v1',model:'fixture-model',dimensions:3,patentIds:records.map(p=>p.id),read:async(id:string)=>records.find(p=>p.id===id),signal:new AbortController().signal,progress:(event:unknown)=>{progress.push(event);}};
  await assert.rejects(indexFulltext({...options,embed:async texts=>{if(++calls===2)throw Error('provider unavailable');return texts.map(()=>[1,0,0]);}}),/provider unavailable/);
  assert.deepEqual(await store.progress(meta.id,'v1','fixture-model',3),{done:10,total:12});
  let requested=0;const result=await indexFulltext({...options,embed:async texts=>{requested+=texts.length;return texts.map(()=>[1,0,0]);}});
  assert.equal(requested,2);assert.equal(result.done,12);assert.equal(result.total,12);
  assert.equal((progress[0] as {stage:string}).stage,'documents');
  await store.saveDocument(meta.id,records[1],'selected');
  let selectedTexts=0;
  const selected=await indexFulltext({...options,version:'selected',patentIds:[records[0].id],embed:async texts=>{selectedTexts+=texts.length;return texts.map(()=>[1,0,0]);}});
  assert.equal(selectedTexts,1);assert.equal(selected.done,1);assert.equal(selected.total,1);
  assert.deepEqual(await store.progress(meta.id,'selected','fixture-model',3),{done:1,total:2});
  assert.deepEqual(await store.pending(meta.id,'selected','fixture-model',3,10,[]),[]);
  const batches:string[][]=[];
  const entire=await indexFulltext({...options,version:'cursor-batches',embed:async texts=>{batches.push(texts);return texts.map(()=>[1,0,0]);}});
  assert.deepEqual(batches.map(batch=>batch.length),[10,2]);assert.equal(entire.done,12);assert.equal(entire.total,12);
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(indexFulltext({...options,signal:cancelled.signal,embed:async()=>{throw Error('should not call');}}));
 }finally{await pool.end();}
});
