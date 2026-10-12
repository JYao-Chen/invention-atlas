import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {IdentityStore} from '../src/server/identity';
import {withAccess} from '../src/server/postgres';
import {PostgresStore} from '../src/server/postgres-store';
import {ProfessionalStore} from '../src/server/professional-store';
import {submitProfessionalStage} from '../src/server/professional-submission';
import {normalize,datasetMeta} from '../src/server/importers';

test('independent worker saves layout scope and candidates across process restart',async()=>{
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),role='layout_worker_'+randomUUID().replaceAll('-','');
 const schema=(await admin.query('SELECT current_schema() AS name')).rows[0].name;
 await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);
 await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
 await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
 await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
 const runtimeUrl=new URL(process.env.DATABASE_URL!);runtimeUrl.username=role;const runtime=new Pool({connectionString:runtimeUrl.toString()});
 let worker:ChildProcess|undefined,output='';
 const start=()=>{const child=spawn(process.execPath,process.env.PATENT_WORKER_ENTRY?[process.env.PATENT_WORKER_ENTRY]:['--import','tsx','scripts/agent-worker.ts'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:runtimeUrl.toString(),QUEUE_DATABASE_URL:process.env.DATABASE_URL},stdio:['ignore','pipe','pipe']});child.stdout?.on('data',chunk=>{output+=chunk.toString();});child.stderr?.on('data',chunk=>{output+=chunk.toString();});worker=child;return child;};
 const stop=async()=>{if(!worker||worker.exitCode!==null)return;const child=worker;child.kill('SIGTERM');await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('worker did not shut down'));},10000);child.once('exit',()=>{clearTimeout(timeout);resolve();});});worker=undefined;};
 async function complete(runId:string){const deadline=Date.now()+20000;while(Date.now()<deadline){const job=(await admin.query('SELECT state,error,attempts FROM jobs WHERE run_id=$1',[runId])).rows[0];if(job.state==='completed'){assert.equal(job.attempts,1);return;}if(job.state==='failed'||worker?.exitCode!==null)throw new Error('worker failure: '+job.error+' '+output);await delay(100);}throw new Error('worker timeout: '+output);}
 try{
  const identity=await new IdentityStore(runtime).initializeAdmin('layout-worker-admin','layout-worker-password','SYNTHETIC worker organization');
  const scope={userId:identity.user!.id,organizationId:identity.organizationId,projectId:identity.projectId};
  const {task,first}=await withAccess(scope,async()=>{
   const records=[normalize({id:'US-SYNTHETIC-WORKER',title:'SYNTHETIC',abstract:'SYNTHETIC literal evidence',publication_date:'2020-01-01',ipc:['H04L']},'fixture')];
   const dataset=datasetMeta('SYNTHETIC independent worker',records,'fixture','fixture');await new PostgresStore(runtime).saveDataset(dataset,records);
   const task=await new ProfessionalStore(runtime).create({workflow:'patent-layout',datasetId:dataset.id,objective:'SYNTHETIC improve transmission latency',ipc:'H04L',yearStart:2020,yearEnd:2020});
   return {task,first:await submitProfessionalStage(runtime,task.id,'fixture-no-model')};
  });
  start();await complete(first.id);await stop();
  const second=await withAccess(scope,async()=>{
   const tasks=new ProfessionalStore(runtime),saved=await tasks.get(task.id);assert.equal(saved.status,'awaiting_confirmation');
   const artifact=saved.artifacts.find((a:{stage:string})=>a.stage==='scope');assert.equal(artifact.data.patentIds.length,1);
   assert.equal((await new PostgresStore(runtime).run(first.id))?.status,'completed');
   await tasks.confirm(task.id,'scope',artifact.revision);return submitProfessionalStage(runtime,task.id,'fixture-no-model');
  });
  start();await complete(second.id);await stop();
  await withAccess(scope,async()=>{
   const saved=await new ProfessionalStore(runtime).get(task.id);assert.equal(saved.current_stage,'retrieval');assert.equal(saved.status,'awaiting_confirmation');
   assert.equal(saved.artifacts.filter((a:{status:string})=>a.status==='confirmed').length,1);assert.equal(saved.artifacts.find((a:{stage:string})=>a.stage==='retrieval').data.patentIds.length,1);
   assert.equal((await new PostgresStore(runtime).run(second.id))?.status,'completed');
  });
  assert.equal((await admin.query('SELECT count(*)::int AS count FROM model_usage')).rows[0].count,0);
 }finally{await stop();await runtime.end();await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();}
});
