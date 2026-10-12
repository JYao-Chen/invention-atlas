import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {postgresPool,migratePostgres,transaction,MIGRATIONS} from '../src/server/postgres';
import {PostgresStore} from '../src/server/postgres-store';
import type {Dataset,Run} from '../src/lib/types';
import {normalize,datasetMeta} from '../src/server/importers';

test('PostgreSQL migrations are repeatable and failed transactions roll back', {skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL);
 const id=randomUUID();
 try{
  await migratePostgres(pool);
  await migratePostgres(pool);
  assert.equal((await pool.query('SELECT count(*)::integer n FROM schema_migrations')).rows[0].n,MIGRATIONS.length);
  await assert.rejects(transaction(pool,async client=>{
   await client.query('INSERT INTO datasets(id,payload) VALUES($1,$2)',[id,JSON.stringify({id,title:'测试'})]);
   throw new Error('deliberate rollback');
  }),/deliberate rollback/);
  assert.equal((await pool.query('SELECT id FROM datasets WHERE id=$1',[id])).rowCount,0);
  await transaction(pool,async client=>{
   await client.query('INSERT INTO reports(id,title,run_id,payload,created_at) VALUES($1,$2,$3,$4,$5)',[id,'snapshot','removed-run',JSON.stringify({run:{answer:'保留'}}),new Date().toISOString()]);
  });
  assert.equal((await pool.query('SELECT payload FROM reports WHERE id=$1',[id])).rows[0].payload.run.answer,'保留');
 }finally{await pool.query('DELETE FROM reports WHERE id=$1',[id]);await pool.end();}
});

test('PG projection, literal filtering and embedding updates preserve original patent text',{skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL),store=new PostgresStore(pool);
 const record=normalize({id:'US999001B1',title:'100%_literal',abstract:'fixture',applicants:['Company A'],description:'完整说明书',claims:[{number:1,text:'original claim'}]},'UNIT TEST ONLY');
 const meta=datasetMeta('PG projection',[record],'unit-test','fixture');
 const prior=await store.setting('active_dataset');
 try{
  await store.saveDataset(meta,[record]);
  const projected=(await store.analysisPatents(meta.id))[0];
  assert.equal(projected.description,'');assert.equal(projected.rawText,'');
  assert.equal(projected.deferredText?.descriptionChars,record.description.length);
  assert.deepEqual(await store.fullPatent(meta.id,projected),JSON.parse(JSON.stringify(record)));
  assert.equal((await store.patentPage(meta.id,'Company A',1)).total,1);
  assert.equal((await store.patentPage(meta.id,'%_literal',1)).total,1);
  assert.equal((await store.patentPage(meta.id,'absent',1)).total,0);
  const page=await store.patentPage(meta.id,'',1);
  assert.equal(page.records[0].description,undefined);
  assert.equal(page.records[0].claimCount,1);
  await store.saveEmbeddings(meta.id,[{id:record.id,embedding:[0.25,0.75]}]);
  assert.deepEqual((await store.patent(meta.id,record.id))?.embedding,[0.25,0.75]);
  assert.equal((await store.patent(meta.id,record.id))?.description,record.description);
 }finally{
  await pool.query('DELETE FROM patents WHERE dataset_id=$1',[meta.id]);
  await pool.query('DELETE FROM datasets WHERE id=$1',[meta.id]);
  if(prior!==undefined)await store.setting('active_dataset',prior);else await pool.query("DELETE FROM settings WHERE key='active_dataset'");
  await pool.end();
 }
});

test('PG sessions expire and model checkpoints preserve method and patent boundaries',{skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL),store=new PostgresStore(pool),id=randomUUID(),token=randomUUID();
 const rows=[{element:'传输',quote:'original source',claim_offset:4}];
 const effects=[{technology:'传输',effect:'延迟降低',quote:'source text'}];
 const key=JSON.stringify(['claim-comparison-v2',id,'test']);
 try{
  await migratePostgres(pool);
  await store.createSession(token,2000);
  assert.equal(await store.sessionValid(token,1999),true);
  assert.equal(await store.sessionValid(token,2000),false);
  await store.deleteSession(token);
  assert.equal(await store.sessionValid(token,1000),false);
  await store.saveClaimCheckpoint(id,'patent-a','method-a',1,0,rows);
  await store.saveClaimCheckpoint(id,'patent-b','method-a',1,0,rows);
  assert.deepEqual(await store.claimCheckpoint(id,'patent-a','method-a',1,0),rows);
  assert.equal(await store.claimCheckpoint(id,'patent-a','method-b',1,0),undefined);
  await store.saveEffectCheckpoint(id,'patent-a','method-a','description',0,effects);
  assert.deepEqual(await store.effectCheckpoint(id,'patent-a','method-a','description',0),effects);
  await store.saveComparisonCheckpoint(key,{matches:[]});
  assert.deepEqual(await store.comparisonCheckpoint(key),{matches:[]});
  await store.clearCheckpoints(id,'patent-a');
  assert.equal(await store.claimCheckpoint(id,'patent-a','method-a',1,0),undefined);
  assert.equal(await store.effectCheckpoint(id,'patent-a','method-a','description',0),undefined);
  assert.equal(await store.comparisonCheckpoint(key),undefined);
  assert.deepEqual(await store.claimCheckpoint(id,'patent-b','method-a',1,0),rows);
 }finally{await store.deleteSession(token);await store.clearCheckpoints(id);await pool.end();}
});

test('PG history preserves run order, event cursors and reports after bulk conversation deletion',{skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL),store=new PostgresStore(pool),datasetId=randomUUID();
 let reportId:string|undefined;
 try{
  await migratePostgres(pool);
  await pool.query('INSERT INTO datasets(id,payload) VALUES($1,$2)',[datasetId,'{}']);
  const conversation=await store.newConversation(datasetId,'history test');
  const makeRun=():Run=>({id:randomUUID(),conversationId:conversation.id,datasetId,question:'fixture',status:'completed',plan:[],results:[],answer:'原始报告',error:'',model:'test',createdAt:new Date().toISOString()});
  const first=makeRun(),second=makeRun();
  await store.saveRun(first);await store.saveRun(second);await store.saveRun({...first,answer:'修订'});
  await store.finishRun(second);
  assert.deepEqual((await store.events(second.id)).map(event=>event.event),['done']);
  assert.deepEqual((await store.runs(conversation.id)).map(run=>run.id),[first.id,second.id]);
  const seq=await store.event(first.id,'text',{text:'第一段'});
  const next=await store.event(first.id,'done',{});
  assert.ok(next>seq);
  assert.deepEqual((await store.events(first.id,seq)).map(event=>event.event),['done']);
  reportId=await store.saveReport(first,'snapshot');
  await assert.rejects(store.deleteSaved('conversations',[conversation.id],id=>id===first.id),/先停止/);
  assert.equal((await store.run(first.id))?.answer,'修订');
  await assert.rejects(store.deleteSaved('conversations',[conversation.id,'missing']),/不存在/);
  assert.ok(await store.run(first.id));
  assert.equal((await store.deleteSaved('conversations',[conversation.id,conversation.id])).deleted,1);
  assert.equal(await store.run(first.id),undefined);
  assert.deepEqual(await store.events(first.id),[]);
  assert.equal((await store.reports()).find(report=>report.id===reportId)?.run.answer,'原始报告');
  await store.deleteSaved('reports',[reportId]);reportId=undefined;
 }finally{
  if(reportId)await pool.query('DELETE FROM reports WHERE id=$1',[reportId]);
  await pool.query('DELETE FROM datasets WHERE id=$1',[datasetId]);
  await pool.end();
 }
});

test('store operations join the caller transaction instead of escaping onto another pooled connection',{skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL),store=new PostgresStore(pool),id=randomUUID();
 try{
  await migratePostgres(pool);
  await assert.rejects(transaction(pool,async()=>{
   await store.setting(id,'must roll back');
   await store.newConversation(id,'must roll back');
   throw new Error('abort unit of work');
  }),/abort unit of work/);
  assert.equal(await store.setting(id),undefined);
  assert.equal((await pool.query('SELECT id FROM conversations WHERE dataset_id=$1',[id])).rowCount,0);
 }finally{await pool.end();}
});

test('async PostgreSQL store preserves dataset payload and rejects duplicate writes atomically',{skip:!process.env.PG_TEST_DATABASE_URL},async()=>{
 const pool=postgresPool(process.env.DATABASE_URL||process.env.PG_TEST_DATABASE_URL),store=new PostgresStore(pool);
 const id=randomUUID();
 const meta:Dataset={id,name:'PG测试',createdAt:new Date().toISOString(),count:0,source:'unit-test',sampling:'fixture',coverage:{},years:[],warnings:[],indexed:0};
 const prior=await store.setting('active_dataset');
 try{
  await store.saveDataset(meta,[]);
  assert.deepEqual(await store.dataset(id),meta);
  assert.deepEqual(await store.patents(id),[]);
  await assert.rejects(store.saveDataset({...meta,name:'duplicate'},[]));
  assert.deepEqual(await store.dataset(id),meta);
  await store.updateDataset({...meta,name:'updated'});
  assert.equal((await store.dataset(id))?.name,'updated');
 }finally{
  await pool.query('DELETE FROM datasets WHERE id=$1',[id]);
  if(prior!==undefined)await store.setting('active_dataset',prior);
  else await pool.query("DELETE FROM settings WHERE key='active_dataset'");
  await pool.end();
 }
});
