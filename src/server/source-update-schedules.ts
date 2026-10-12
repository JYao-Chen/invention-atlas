import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {connection,currentAccess,transaction,withAccess} from './postgres';
import {dltSourceUpdateInput} from './dlt-source-update';
import {submitSourceUpdate} from './source-update-job';

export const sourceScheduleInput=z.object({params:dltSourceUpdateInput,intervalHours:z.number().int().min(1).max(8760),enabled:z.boolean()}).strict();
export class SourceUpdateSchedules{
 constructor(private readonly pool:Pool){}
 async list(){return (await connection(this.pool).query('SELECT * FROM source_update_schedules ORDER BY created_at DESC,id')).rows;}
 async save(input:unknown){
  const data=sourceScheduleInput.parse(input),scope=currentAccess();if(!scope)throw new Error('来源调度需要项目身份');
  return transaction(this.pool,async db=>(await db.query(`INSERT INTO source_update_schedules(id,organization_id,project_id,dataset_id,actor_id,params,interval_hours,enabled)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dataset_id) DO UPDATE SET actor_id=excluded.actor_id,params=excluded.params,interval_hours=excluded.interval_hours,enabled=excluded.enabled,next_run_at=now(),updated_at=now() RETURNING *`,[randomUUID(),scope.organizationId,scope.projectId,data.params.datasetId,scope.userId,JSON.stringify(data.params),data.intervalHours,data.enabled])).rows[0]);
 }
 async remove(id:string){if(!(await connection(this.pool).query('DELETE FROM source_update_schedules WHERE id=$1 RETURNING id',[id])).rowCount)throw new Error('来源调度不存在或无修改权限');}
 async submitDue(id:string){
  return transaction(this.pool,async db=>{
   const row=(await db.query('SELECT *,next_run_at<=now() AS due FROM source_update_schedules WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row||!row.enabled||!row.due)return;
   if(row.last_run_id){
    const previous=(await db.query("SELECT r.payload->>'status' AS status,EXISTS(SELECT 1 FROM source_update_proposals p WHERE p.run_id=r.id) AND NOT EXISTS(SELECT 1 FROM source_update_batches b WHERE b.run_id=r.id) AS pending FROM runs r WHERE r.id=$1",[row.last_run_id])).rows[0];
    if(previous?.status==='running'||previous?.pending)return;
   }
   const run=await submitSourceUpdate(this.pool,row.params);
   await db.query("UPDATE source_update_schedules SET last_run_id=$2,next_run_at=now()+interval_hours*interval '1 hour',updated_at=now() WHERE id=$1",[id,run.id]);
   return run;
  });
 }
}
export async function dispatchDueSourceUpdates(maintenance:Pool,business:Pool){
 if(currentAccess())throw new Error('来源调度扫描只能由后台维护进程执行');
 const rows=(await maintenance.query(`SELECT s.* FROM source_update_schedules s JOIN users u ON u.id=s.actor_id
  JOIN project_members p ON p.user_id=s.actor_id AND p.project_id=s.project_id AND p.organization_id=s.organization_id
  JOIN organization_members o ON o.user_id=s.actor_id AND o.organization_id=s.organization_id
  WHERE s.enabled AND s.next_run_at<=now() AND u.enabled AND p.role IN('owner','analyst') ORDER BY s.next_run_at,s.id LIMIT 100`)).rows;
 const submitted:string[]=[],errors:{id:string;message:string}[]=[];
 for(const row of rows){
  try{const run=await withAccess({userId:row.actor_id,organizationId:row.organization_id,projectId:row.project_id},()=>new SourceUpdateSchedules(business).submitDue(row.id));if(run)submitted.push(run.id);}
  catch(error){errors.push({id:row.id,message:(error as Error).message});}
 }
 return {submitted,errors};
}
