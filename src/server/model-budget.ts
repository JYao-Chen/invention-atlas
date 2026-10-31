import type {Pool} from 'pg';
import {z} from 'zod';
import {transaction,currentAccess,connection} from './postgres';
import {currentModelRun} from './model-usage';

export class ModelBudgetExceeded extends Error{}

export class ModelBudget{
 constructor(private readonly pool:Pool){}
 async read(runId:string){
  const run=await connection(this.pool).query('SELECT id FROM runs WHERE id=$1',[runId]);if(!run.rows.length)throw new Error('运行不存在或无访问权限');
  return (await connection(this.pool).query('SELECT max_calls,started_calls FROM model_call_budgets WHERE run_id=$1',[runId])).rows[0]??null;
 }
 async set(runId:string,maxCalls:number){
  const maximum=z.number().int().positive().max(2147483647).parse(maxCalls),scope=currentAccess();if(!scope)throw new Error('任务预算需要项目身份');
  return transaction(this.pool,async client=>{
   const run=await client.query('SELECT id FROM runs WHERE id=$1 FOR UPDATE',[runId]);if(!run.rows.length)throw new Error('运行不存在或无访问权限');
   return (await client.query('INSERT INTO model_call_budgets(run_id,organization_id,project_id,max_calls,started_calls) VALUES($1,$2,$3,$4,(SELECT count(*) FROM model_usage WHERE run_id=$1)) ON CONFLICT(run_id) DO UPDATE SET max_calls=excluded.max_calls RETURNING *',[runId,scope.organizationId,scope.projectId,maximum])).rows[0];
  });
 }
 async reserve(runId:string){return transaction(this.pool,async client=>{
  const run=await client.query('SELECT id,organization_id,project_id FROM runs WHERE id=$1 FOR UPDATE',[runId]);if(!run.rows.length)throw new Error('运行不存在或无访问权限');
  const budget=(await client.query('SELECT * FROM model_call_budgets WHERE run_id=$1',[runId])).rows[0];
  if(!budget){await client.query('INSERT INTO model_call_budgets(run_id,organization_id,project_id,max_calls,started_calls) VALUES($1,$2,$3,NULL,(SELECT count(*)+1 FROM model_usage WHERE run_id=$1))',[runId,run.rows[0].organization_id,run.rows[0].project_id]);return;}
  if(budget.max_calls!==null&&budget.started_calls>=budget.max_calls)throw new ModelBudgetExceeded('任务模型调用次数已达到预算上限，请增加预算后继续研究');
  await client.query('UPDATE model_call_budgets SET started_calls=started_calls+1 WHERE run_id=$1',[runId]);
 });}
}
export async function reserveModelCall(){
 const runId=currentModelRun();if(!runId||!currentAccess())return;
 const {db}=await import('./db');await new ModelBudget(db).reserve(runId);
}
