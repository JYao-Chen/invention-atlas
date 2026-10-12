import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {Run,Params} from '../lib/types';
import {transaction,currentAccess} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore} from './job-store';
import {stepSchema} from './planning';
import {z} from 'zod';
import {ModelBudget} from './model-budget';

export async function submitAnalysis(pool:Pool,input:{conversationId:string;datasetId:string;question:string;model:string;forced?:{tool:string;params:Params}[];toolOnly?:boolean;maxModelCalls?:number}){
 const store=new PostgresStore(pool),jobs=new JobStore(pool),question=input.question.trim();
 if(!question||question.length>12000)throw new Error('问题应为1至12000字符');
 const maxModelCalls=z.number().int().positive().max(2147483647).optional().parse(input.maxModelCalls);
 const forced=input.forced?z.array(stepSchema).min(1).max(30).parse(input.forced):undefined;
 if(input.toolOnly&&forced?.length!==1)throw new Error('直接工具任务必须指定一项工具');
 return transaction(pool,async client=>{
  const conversation=(await client.query('SELECT dataset_id FROM conversations WHERE id=$1 FOR UPDATE',[input.conversationId])).rows[0];
  if(!conversation||conversation.dataset_id!==input.datasetId)throw new Error('对话不存在或数据集不匹配');
  if((await store.runs(input.conversationId)).some(r=>r.status==='running'))throw new Error('该对话已有任务在运行');
  const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
  const run:Run={id:randomUUID(),conversationId:input.conversationId,datasetId:meta.id,datasetSnapshot:meta,question,status:'running',plan:[],results:[],answer:'',error:'',model:input.model,createdAt:new Date().toISOString(),progress:{tool:'queue',unit:'等待后台执行'}};
  await store.saveRun(run);
  if(maxModelCalls!==undefined)await new ModelBudget(pool).set(run.id,maxModelCalls);
  await jobs.enqueue(run.id,'analysis',{forced,toolOnly:Boolean(input.toolOnly)});
  await store.event(run.id,'status',{phase:'Queued',message:'任务已保存，等待后台执行'});
  return run;
 });
}

export async function submitReport(pool:Pool,runId:string){
 const store=new PostgresStore(pool);
 return transaction(pool,async client=>{
  await client.query('SELECT id FROM runs WHERE id=$1 FOR UPDATE',[runId]);
  const run=await store.run(runId);if(!run)throw new Error('运行不存在');
  if(run.status==='running')throw new Error('该任务仍在运行');
  if(!run.results.some(result=>result.status==='completed'))throw new Error('没有可用于报告的工具结果');
  const scope=currentAccess();if(!scope)throw new Error('创建任务需要已授权的项目身份');
  const existing=(await client.query('SELECT id FROM jobs WHERE run_id=$1 FOR UPDATE',[runId])).rows[0];
  run.status='running';run.error='';run.answer='';delete run.followups;run.progress={tool:'queue',unit:'等待后台生成报告'};
  await store.saveRun(run);
  if(existing)await client.query("UPDATE jobs SET actor_id=$2,kind='report',payload='{}',state='queued',attempts=0,worker_id=NULL,lease_until=NULL,cancel_requested=false,error='',updated_at=now() WHERE id=$1",[existing.id,scope.userId]);
  else await new JobStore(pool).enqueue(runId,'report',{});
  await store.event(runId,'text-reset',{});
  await store.event(runId,'status',{phase:'Queued',message:'报告重试已保存，等待后台执行'});
  return run;
 });
}
