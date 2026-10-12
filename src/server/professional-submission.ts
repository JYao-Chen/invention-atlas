import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {transaction} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore} from './job-store';
import {professionalInput,PROFESSIONAL_WORKFLOWS,executableStages} from './professional-workflows';

export async function submitProfessionalStage(pool:Pool,taskId:string,model:string){
 return transaction(pool,async client=>{
  const task=(await client.query('SELECT * FROM professional_tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];if(!task)throw new Error('专业任务不存在');
  if(task.status!=='ready')throw new Error('当前阶段未就绪，请先确认待审产物');
  if(!executableStages[task.workflow]?.includes(task.current_stage))throw new Error('该阶段执行器尚未接通');
  const input=professionalInput.parse(task.input),store=new PostgresStore(pool),meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
  const workflow=PROFESSIONAL_WORKFLOWS.find(workflow=>workflow.id===task.workflow);
  const title=workflow?.title||'专业任务';
  const stage=workflow?.stages.find(stage=>stage.id===task.current_stage)?.title;
  if(!stage)throw new Error('专业任务阶段不存在');
  const conversation=await store.newConversation(meta.id,title+' · '+stage);
  const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,datasetSnapshot:meta,question:title+'：'+stage,status:'running',plan:[],results:[],answer:'',error:'',model,createdAt:new Date().toISOString(),progress:{tool:'queue',unit:'等待后台执行'+stage}};
  await store.saveRun(run);await new JobStore(pool).enqueue(run.id,'professional',{taskId,stage:task.current_stage});
  await client.query("UPDATE professional_tasks SET status='queued',execution_run_id=$2,updated_at=now() WHERE id=$1",[taskId,run.id]);
  await store.event(run.id,'status',{phase:'Queued',message:stage+'已入队'});
  return run;
 });
}

export async function retryProfessionalStage(pool:Pool,taskId:string){
 return transaction(pool,async client=>{
  const task=(await client.query('SELECT * FROM professional_tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];if(!task)throw new Error('专业任务不存在');
  if(!['failed','cancelled'].includes(task.status)||!task.execution_run_id)throw new Error('只有失败或取消的阶段可以重试');
  const job=(await client.query('SELECT * FROM jobs WHERE run_id=$1 FOR UPDATE',[task.execution_run_id])).rows[0];
  if(!job||job.kind!=='professional'||['queued','running'].includes(job.state))throw new Error('原阶段尚未结束');
  if(job.payload.taskId!==taskId||job.payload.stage!==task.current_stage)throw new Error('原执行记录不属于当前阶段');
  const store=new PostgresStore(pool),run=await store.run(task.execution_run_id);if(!run||run.status==='running')throw new Error('原运行尚未结束');
  const actor=(await client.query("SELECT nullif(current_setting('app.user_id',true),'') AS id")).rows[0].id;if(!actor)throw new Error('重试任务需要项目身份');
  run.status='running';run.error='';run.answer='';run.progress={tool:'queue',unit:'等待后台重试当前阶段'};await store.saveRun(run);
  await client.query("UPDATE jobs SET state='queued',actor_id=$2,attempts=0,worker_id=NULL,lease_until=NULL,cancel_requested=false,error='',updated_at=now() WHERE id=$1",[job.id,actor]);
  await client.query("UPDATE professional_tasks SET status='queued',updated_at=now() WHERE id=$1",[taskId]);
  await store.event(run.id,'text-reset',{});await store.event(run.id,'status',{phase:'Queued',message:'当前专业阶段已重新入队，保留已保存结果'});
  return run;
 });
}

export async function regenerateProfessionalReport(pool:Pool,taskId:string,model:string){
 return transaction(pool,async client=>{
  const task=(await client.query('SELECT * FROM professional_tasks WHERE id=$1 FOR UPDATE',[taskId])).rows[0];if(!task)throw new Error('专业任务不存在');
  if(task.status!=='completed'||task.current_stage!=='report')throw new Error('只有已完成的专业报告可以重新生成');
  await client.query("UPDATE professional_artifacts SET status='stale' WHERE task_id=$1 AND stage='report'",[taskId]);
  await client.query("UPDATE professional_tasks SET status='ready',updated_at=now() WHERE id=$1",[taskId]);
  return submitProfessionalStage(pool,taskId,model);
 });
}
