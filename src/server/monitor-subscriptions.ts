import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {PostgresStore} from './postgres-store';
import {submitAnalysis} from './task-submission';
import type {Run} from '../lib/types';

export const monitorSubscriptionInput=z.object({datasetId:z.string().min(1),name:z.string().trim().min(1).max(200),intervalHours:z.number().int().min(1).max(8760),params:z.object({query:z.string().trim().min(1).max(2000),strategy_id:z.string().trim().min(1).max(100),top_k:z.number().int().min(1).max(1000).default(20),counting:z.enum(['publication','family']).default('publication'),year_start:z.number().int().optional(),year_end:z.number().int().optional(),applicant:z.string().trim().max(300).optional(),ipc:z.string().trim().max(100).optional()}).strict()}).strict().superRefine((data,ctx)=>{if(data.params.year_start!==undefined&&data.params.year_end!==undefined&&data.params.year_start>data.params.year_end)ctx.addIssue({code:'custom',path:['params','year_end'],message:'结束年份不能早于开始年份'});});
export class MonitorSubscriptions{
 constructor(private readonly pool:Pool){}
 async list(){return (await connection(this.pool).query('SELECT * FROM monitor_subscriptions ORDER BY created_at DESC,id')).rows;}
 async versions(id:string){
  if(! (await connection(this.pool).query('SELECT id FROM monitor_subscriptions WHERE id=$1',[id])).rowCount)throw new Error('订阅不存在或无阅读权限');
  return (await connection(this.pool).query('SELECT revision,params,created_at FROM monitor_subscription_versions WHERE subscription_id=$1 ORDER BY revision DESC',[id])).rows;
 }
 async create(input:unknown){
  const data=monitorSubscriptionInput.parse(input),scope=currentAccess();if(!scope)throw new Error('监测订阅需要项目身份');
  return transaction(this.pool,async db=>{
   if(!await new PostgresStore(this.pool).dataset(data.datasetId))throw new Error('数据集不存在或无访问权限');
   const row=(await db.query('INSERT INTO monitor_subscriptions(id,organization_id,project_id,subscriber_id,dataset_id,name,params,interval_hours) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),scope.organizationId,scope.projectId,scope.userId,data.datasetId,data.name,JSON.stringify(data.params),data.intervalHours])).rows[0];
   await db.query('INSERT INTO monitor_subscription_versions(subscription_id,revision,params) VALUES($1,1,$2)',[row.id,JSON.stringify(data.params)]);
   return row;
  });
 }
 async update(id:string,input:unknown){
  const data=z.object({enabled:z.boolean().optional(),intervalHours:z.number().int().min(1).max(8760).optional(),params:z.record(z.unknown()).optional(),expectedRevision:z.number().int().positive().optional()}).strict()
   .refine(value=>value.enabled!==undefined||value.intervalHours!==undefined||value.params!==undefined,'请提供启停状态、间隔或检索策略')
   .refine(value=>(value.params===undefined)===(value.expectedRevision===undefined),'修改策略必须提供保存版本 expectedRevision').parse(input);
  return transaction(this.pool,async db=>{
   const row=(await db.query('SELECT * FROM monitor_subscriptions WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new Error('订阅不存在或无修改权限');
   if(data.params!==undefined&&data.expectedRevision!==row.strategy_revision)throw new Error('监测策略已有新版本，请重新读取后修改');
   const params=data.params===undefined?row.params:monitorSubscriptionInput.parse({datasetId:row.dataset_id,name:row.name,intervalHours:data.intervalHours??row.interval_hours,params:data.params}).params;
   const changed=!isDeepStrictEqual(params,row.params);
   if(changed&&row.last_run_id&&(await new PostgresStore(this.pool).run(row.last_run_id))?.status==='running')throw new Error('该订阅已有监测任务未结束，请结束后修改策略');
   const updated=(await db.query('UPDATE monitor_subscriptions SET enabled=coalesce($2,enabled),interval_hours=coalesce($3,interval_hours),params=$4,strategy_revision=strategy_revision+$5,next_run_at=CASE WHEN $5=1 OR ($2=true AND NOT enabled) THEN now() ELSE next_run_at END,updated_at=now() WHERE id=$1 RETURNING *',[id,data.enabled??null,data.intervalHours??null,JSON.stringify(params),changed?1:0])).rows[0];
   if(changed)await db.query('INSERT INTO monitor_subscription_versions(subscription_id,revision,params) VALUES($1,$2,$3)',[id,updated.strategy_revision,JSON.stringify(params)]);
   return updated;
  });
 }
 async remove(id:string){const result=await connection(this.pool).query('DELETE FROM monitor_subscriptions WHERE id=$1 RETURNING id',[id]);if(!result.rowCount)throw new Error('订阅不存在或无删除权限');}
 async submit(id:string,model:string):Promise<Run>{return (await this.submitWork(id,model,false))!;}
 async submitDue(id:string,model:string){return this.submitWork(id,model,true);}
 private async submitWork(id:string,model:string,dueOnly:boolean){
  return transaction(this.pool,async db=>{
   const row=(await db.query('SELECT s.*,d.source_revision,next_run_at<=now() OR d.source_revision>s.submitted_source_revision AS due FROM monitor_subscriptions s JOIN datasets d ON d.id=s.dataset_id WHERE s.id=$1 FOR UPDATE OF s',[id])).rows[0];
   if(dueOnly&&(!row||!row.enabled||!row.due))return undefined;
   if(!row)throw new Error('订阅不存在或无执行权限');
   if(!row.enabled)throw new Error('订阅已暂停，请恢复后执行');
   const store=new PostgresStore(this.pool);
   if(row.last_run_id&&(await store.run(row.last_run_id))?.status==='running'){if(dueOnly)return undefined;throw new Error('该订阅已有监测任务未结束');}
   const input=monitorSubscriptionInput.parse({datasetId:row.dataset_id,name:row.name,intervalHours:row.interval_hours,params:row.params});
   const conversation=await store.newConversation(input.datasetId,'监测订阅 · '+input.name);
   const baselineId='subscription:'+row.id+(row.strategy_revision>1?':v'+row.strategy_revision:'');
   const run=await submitAnalysis(this.pool,{conversationId:conversation.id,datasetId:input.datasetId,question:'执行入库数据监测订阅：'+input.name,model,toolOnly:true,forced:[{tool:'monitor_patent_changes',params:{...input.params,strategy_id:baselineId}}]});
   await db.query("UPDATE jobs SET payload=payload||jsonb_build_object('monitorSubscriptionId',$2::text) WHERE run_id=$1",[run.id,row.id]);
   await db.query("UPDATE monitor_subscriptions SET last_run_id=$2,submitted_source_revision=$3,next_run_at=now()+interval_hours*interval '1 hour',updated_at=now() WHERE id=$1",[id,run.id,row.source_revision]);
   await store.event(run.id,'subscription',{id:row.id,name:row.name,strategyId:input.params.strategy_id,strategyRevision:row.strategy_revision,baselineId,intervalHours:input.intervalHours});
   return run;
  });
 }
}
