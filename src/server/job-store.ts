import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction,type AccessScope} from './postgres';
import {PostgresStore} from './postgres-store';
type JobBase={id:string;actorId:string;organizationId:string;projectId:string;payload:Record<string,unknown>;state:string;attempts:number;workerId:string|null;cancelRequested:boolean};
export type Job=JobBase&({runId:string;kind:'analysis'|'report'|'professional'|'fulltext'|'source-update'|'research'}|{runId:null;materialId:string;kind:'material-ocr'});
const fields='id,run_id AS "runId",material_id AS "materialId",actor_id AS "actorId",organization_id AS "organizationId",project_id AS "projectId",kind,payload,state,attempts,worker_id AS "workerId",cancel_requested AS "cancelRequested"';
export const jobAccess=(job:Job):AccessScope=>({userId:job.actorId,organizationId:job.organizationId,projectId:job.projectId});
export class JobStore{
 constructor(private readonly pool:Pool){}
 async enqueue(runId:string,kind:Exclude<Job['kind'],'material-ocr'>,payload:Record<string,unknown>){
  const scope=currentAccess();if(!scope)throw new Error('创建任务需要已授权的项目身份');
  return (await connection(this.pool).query(`INSERT INTO jobs(id,run_id,actor_id,organization_id,project_id,kind,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,[randomUUID(),runId,scope.userId,scope.organizationId,scope.projectId,kind,payload])).rows[0] as Job;
 }
 async enqueueMaterial(materialId:string,pages:number[]){
  const scope=currentAccess();if(!scope)throw new Error('创建OCR任务需要项目身份');
  return (await connection(this.pool).query(`INSERT INTO jobs(id,material_id,actor_id,organization_id,project_id,kind,payload) VALUES($1,$2,$3,$4,$5,'material-ocr',$6) RETURNING ${fields}`,[randomUUID(),materialId,scope.userId,scope.organizationId,scope.projectId,JSON.stringify({pages})])).rows[0] as Job;
 }
 async get(id:string):Promise<Job|undefined>{return (await connection(this.pool).query(`SELECT ${fields} FROM jobs WHERE id=$1`,[id])).rows[0];}
 async forRun(runId:string):Promise<Job|undefined>{return (await connection(this.pool).query(`SELECT ${fields} FROM jobs WHERE run_id=$1`,[runId])).rows[0];}
 async cancel(id:string){
  const result=await connection(this.pool).query("UPDATE jobs SET cancel_requested=true,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,updated_at=now() WHERE id=$1 AND state IN('queued','running') RETURNING id",[id]);
  return Boolean(result.rowCount);
 }
 // Queue maintenance connection only; business execution uses jobAccess with the runtime pool.
 async claim(workerId:string,leaseSeconds=60):Promise<Job|undefined>{
  if(currentAccess())throw new Error('任务领取只能由后台执行进程调用');
  if(!workerId.trim()||!Number.isInteger(leaseSeconds)||leaseSeconds<2)throw new Error('执行进程与租约参数无效');
  return transaction(this.pool,async client=>{
   const abandoned=await client.query("UPDATE jobs SET state='cancelled',error='任务已取消',lease_until=NULL,updated_at=now() WHERE state='running' AND cancel_requested AND lease_until<now() RETURNING run_id");
   const store=new PostgresStore(this.pool);
   if(abandoned.rows.length)await client.query("UPDATE professional_tasks SET status='cancelled',updated_at=now() WHERE execution_run_id=ANY($1::text[]) AND status IN('queued','running')",[abandoned.rows.map(r=>r.run_id)]);
   if(abandoned.rows.length)await client.query("UPDATE research_tasks SET status='paused',updated_at=now() WHERE id=ANY($1::text[]) AND status IN('queued','running')",[abandoned.rows.map(r=>r.run_id)]);
   for(const row of abandoned.rows){if(!row.run_id)continue;const run=await store.run(row.run_id);if(run?.status==='running'){run.status='cancelled';run.error='任务已取消';await store.finishRun(run);}}
   const revoked=await client.query("UPDATE jobs j SET state='cancelled',error='发起者权限已撤销',updated_at=now() WHERE j.state IN('queued','running') AND (j.state='queued' OR j.lease_until<now()) AND NOT EXISTS(SELECT 1 FROM users u JOIN project_members p ON p.user_id=u.id JOIN organization_members o ON o.user_id=p.user_id AND o.organization_id=p.organization_id WHERE u.id=j.actor_id AND u.enabled AND p.project_id=j.project_id AND p.role IN('owner','analyst')) RETURNING run_id");
   if(revoked.rows.length)await client.query("UPDATE professional_tasks SET status='cancelled',updated_at=now() WHERE execution_run_id=ANY($1::text[]) AND status IN('queued','running')",[revoked.rows.map(r=>r.run_id)]);
   if(revoked.rows.length)await client.query("UPDATE research_tasks SET status='paused',error='发起者权限已撤销',updated_at=now() WHERE id=ANY($1::text[]) AND status IN('queued','running')",[revoked.rows.map(r=>r.run_id)]);
   for(const row of revoked.rows){if(!row.run_id)continue;const run=await store.run(row.run_id);if(run?.status==='running'){run.status='cancelled';run.error='发起者权限已撤销';await store.finishRun(run);}}
   return (await client.query(`UPDATE jobs SET state='running',attempts=attempts+1,worker_id=$1,lease_until=now()+$2*interval '1 second',updated_at=now() WHERE id=(SELECT id FROM jobs WHERE NOT cancel_requested AND (state='queued' OR state='running' AND lease_until<now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ${fields}`,[workerId,leaseSeconds])).rows[0];
  });
 }
 async heartbeat(id:string,workerId:string,leaseSeconds=60){
  if(!Number.isInteger(leaseSeconds)||leaseSeconds<2)throw new Error('租约参数无效');
  return Boolean((await connection(this.pool).query("UPDATE jobs SET lease_until=now()+$3*interval '1 second',updated_at=now() WHERE id=$1 AND worker_id=$2 AND state='running' AND lease_until>now() AND NOT cancel_requested AND EXISTS(SELECT 1 FROM users u JOIN project_members p ON p.user_id=u.id JOIN organization_members o ON o.user_id=p.user_id AND o.organization_id=p.organization_id WHERE u.id=jobs.actor_id AND u.enabled AND p.project_id=jobs.project_id AND p.role IN('owner','analyst')) RETURNING id",[id,workerId,leaseSeconds])).rowCount);
 }
 async finish(id:string,workerId:string,state:'completed'|'failed'|'cancelled',error=''){
  return Boolean((await connection(this.pool).query('UPDATE jobs SET state=$3,error=$4,lease_until=NULL,updated_at=now() WHERE id=$1 AND worker_id=$2 AND state=\'running\' AND lease_until>now() RETURNING id',[id,workerId,state,error])).rowCount);
 }
}
