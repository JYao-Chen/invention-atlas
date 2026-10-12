import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {transaction,currentAccess} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore,type Job} from './job-store';
import {dltSourceUpdateInput,updateDltSource} from './dlt-source-update';
import {SourceUpdates} from './source-updates';
import {z} from 'zod';
export async function sourceUpdateTasks(pool:Pool,datasetId:string,page=1){
 z.string().min(1).parse(datasetId);z.number().int().positive().parse(page);
 return transaction(pool,async client=>{
  if(!await new PostgresStore(pool).dataset(datasetId))throw new Error('数据集不存在或无访问权限');
  const total=(await client.query("SELECT count(*)::int AS n FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind='source-update' AND r.payload->>'datasetId'=$1",[datasetId])).rows[0].n,pages=Math.max(1,Math.ceil(total/20)),actual=Math.min(page,pages);
  const tasks=(await client.query("SELECT r.id AS run_id,r.payload->>'status' AS status,r.payload->>'question' AS question,r.payload->>'error' AS error,r.payload->'progress' AS progress,r.payload->>'createdAt' AS created_at,j.state AS queue_state,j.payload AS scope,b.id AS batch_id,b.counts,(b.id IS NULL AND EXISTS(SELECT 1 FROM source_update_proposals p WHERE p.run_id=r.id)) AS pending_confirmation FROM jobs j JOIN runs r ON r.id=j.run_id LEFT JOIN source_update_batches b ON b.run_id=r.id WHERE j.kind='source-update' AND r.payload->>'datasetId'=$1 ORDER BY r.position DESC,r.id LIMIT 20 OFFSET $2",[datasetId,(actual-1)*20])).rows;
  return {tasks,total,page:actual,pages,pageSize:20};
 },{repeatableRead:true,readOnly:true});
}
export async function submitSourceUpdate(pool:Pool,input:unknown){
 const data=dltSourceUpdateInput.parse(input),store=new PostgresStore(pool);
 return transaction(pool,async client=>{
  await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[data.datasetId]);const meta=await store.dataset(data.datasetId);if(!meta)throw new Error('数据集不存在或无访问权限');
  if((await client.query("SELECT j.id FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind IN('source-update','fulltext') AND j.state IN('queued','running') AND r.payload->>'datasetId'=$1",[data.datasetId])).rowCount)throw new Error('该数据集已有来源更新或全文索引任务');
  const conversation=await store.newConversation(meta.id,'来源更新 · DLT-Patents');
  const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,datasetSnapshot:meta,question:'更新DLT-Patents源窗口 '+data.offset+'，'+data.batches+'批',status:'running',plan:[],results:[],answer:'',error:'',model:'data-connector',createdAt:new Date().toISOString(),progress:{tool:'source-update',unit:'等待来源更新'}};
  await store.saveRun(run);await new JobStore(pool).enqueue(run.id,'source-update',data);await store.event(run.id,'status',{phase:'Queued',message:'来源更新范围已保存，等待后台读取'});return run;
 });
}
export async function retrySourceUpdate(pool:Pool,runId:string){
 const store=new PostgresStore(pool),scope=currentAccess();if(!scope)throw new Error('来源重试需要项目身份');
 return transaction(pool,async client=>{
  const original=await store.run(runId);if(!original)throw new Error('运行不存在或无访问权限');
  await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[original.datasetId]);if(!await store.dataset(original.datasetId))throw new Error('数据集不存在或无访问权限');
  await client.query('SELECT id FROM runs WHERE id=$1 FOR UPDATE',[runId]);const run=(await store.run(runId))!;
  const job=(await client.query('SELECT id,kind,payload,state FROM jobs WHERE run_id=$1 FOR UPDATE',[runId])).rows[0];
  if(!job||job.kind!=='source-update')throw new Error('该运行不是来源更新任务');
  if(!['failed','cancelled','interrupted'].includes(run.status)||['queued','running'].includes(job.state))throw new Error('仅失败、取消或中断的终态来源任务可以重试');
  dltSourceUpdateInput.parse(job.payload);
  if((await client.query("SELECT j.id FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind IN('source-update','fulltext') AND j.state IN('queued','running') AND r.payload->>'datasetId'=$1",[run.datasetId])).rowCount)throw new Error('该数据集已有来源更新或全文索引任务');
  await client.query("UPDATE jobs SET actor_id=$2,state='queued',attempts=0,worker_id=NULL,lease_until=NULL,cancel_requested=false,error='',updated_at=now() WHERE id=$1",[job.id,scope.userId]);
  run.status='running';run.error='';run.answer='';run.progress={tool:'source-update',unit:'等待重试来源更新'};await store.saveRun(run);await store.event(run.id,'text-reset',{});await store.event(run.id,'status',{phase:'Queued',message:'来源重试已保存；已提交批次将复用，不重复入库'});return run;
 });
}
export async function executeSourceUpdate(pool:Pool,job:Job,run:Run,signal:AbortSignal,request:typeof fetch=fetch){
 const store=new PostgresStore(pool),updates=new SourceUpdates(pool);let batch=await updates.forRun(run.id);
 if(!batch){const proposal=await updates.proposal(run.id);if(proposal){signal.throwIfAborted();await updates.apply(proposal.input,run.id);}else await updateDltSource(pool,job.payload,signal,async(value)=>{run.progress={tool:'source-update',done:value.done,total:value.total,unit:value.stage==='download'?'下载来源窗口':'校验并入库'};await store.saveRun(run);await store.event(run.id,'progress',{...run.progress,offset:value.offset,records:value.records});},request,run.id);batch=await updates.forRun(run.id);}
 if(!batch)throw new Error('来源更新未保存批次');run.answer=`来源更新完成：新增${batch.counts.added}条，更新${batch.counts.updated}条，不变${batch.counts.unchanged}条。批次 ${batch.id}。仅更新已读取的源窗口。`;
 run.progress={tool:'source-update',unit:'来源批次已保存'};await store.saveRun(run);
}
export async function sourceUpdatePending(pool:Pool,runId:string){
 const updates=new SourceUpdates(pool),proposal=await updates.proposal(runId);if(!proposal)throw new Error('没有可访问的待处理来源快照');
 const batch=await updates.forRun(runId);return {runId,observedAt:proposal.input.observedAt,sourceName:proposal.input.sourceName,sourceUrl:proposal.input.sourceUrl,resolved:Boolean(batch),...(await updates.preview(proposal.input))};
}
export async function resolveSourceUpdate(pool:Pool,runId:string,input:unknown){
 const body=z.object({resolutions:z.array(z.object({patentId:z.string().min(1),choice:z.enum(['keep-manual','accept-source']),expectedRecord:z.record(z.unknown())}).strict()).max(1000)}).strict().parse(input),store=new PostgresStore(pool),updates=new SourceUpdates(pool);
 return transaction(pool,async client=>{
  const original=await store.run(runId);if(!original)throw new Error('运行不存在或无访问权限');await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[original.datasetId]);await client.query('SELECT id FROM runs WHERE id=$1 FOR UPDATE',[runId]);const run=(await store.run(runId))!;
  const job=(await client.query('SELECT id,kind,state FROM jobs WHERE run_id=$1 FOR UPDATE',[runId])).rows[0];if(job?.kind!=='source-update')throw new Error('该运行不是来源更新任务');
  const previous=await updates.forRun(runId);if(previous&&run.status==='completed')return run;
  if(['queued','running'].includes(job.state)||!['failed','cancelled','interrupted'].includes(run.status))throw new Error('请等待来源任务停止后处理冲突');
  const proposal=await updates.proposal(runId);if(!proposal)throw new Error('没有可访问的待处理来源快照');
  const result=await updates.apply({...proposal.input,resolutions:body.resolutions},runId);
  run.status='completed';run.error='';run.answer=`来源快照确认完成：新增${result.counts.added}条，更新${result.counts.updated}条，不变${result.counts.unchanged}条。批次 ${result.id}。`;run.progress={tool:'source-update',unit:'来源批次已保存'};
  await client.query("UPDATE jobs SET state='completed',error='',cancel_requested=false,worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[job.id]);await store.event(runId,'text-reset',{});await store.event(runId,'status',{phase:'SourceConfirmed',message:'已按确认选择保存来源快照'});await store.finishRun(run);return run;
 });
}
