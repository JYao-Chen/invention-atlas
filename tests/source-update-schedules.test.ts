import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {postgresPool,withAccess} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {PostgresStore} from '../src/server/postgres-store';
import {datasetMeta} from '../src/server/importers';

test('source schedules persist configuration, dispatch with runtime identity and do not duplicate active jobs',async()=>{
 const admin=postgresPool(),role='source_schedule_'+randomUUID().replaceAll('-','');let runtime:ReturnType<typeof postgresPool>|undefined;
 try{
  const identity=await new IdentityStore(admin).initializeAdmin('schedule-admin','schedule-password-123','Schedule fixture');
  const schema=(await admin.query('SELECT current_schema() AS name')).rows[0].name;
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  const state=globalThis as unknown as {patentPool?:ReturnType<typeof postgresPool>};state.patentPool=runtime;
  const {SourceUpdateSchedules,dispatchDueSourceUpdates}=await import('../src/server/source-update-schedules');
  const {SourceUpdates}=await import('../src/server/source-updates');
  const scope={userId:identity.user!.id,organizationId:identity.organizationId,projectId:identity.projectId};
  const schedule=await withAccess(scope,async()=>{
   const meta=datasetMeta('Scheduled fixture',[],'fixture','TEST ONLY');await new PostgresStore(runtime!).saveDataset(meta,[]);
   return new SourceUpdateSchedules(runtime!).save({params:{datasetId:meta.id,offset:0,batches:1,query:''},intervalHours:24,enabled:true});
  });
  const dispatched=await dispatchDueSourceUpdates(admin,runtime);assert.equal(dispatched.submitted.length,1);assert.deepEqual(dispatched.errors,[]);
  await admin.query("UPDATE source_update_schedules SET next_run_at=now()-interval '1 hour' WHERE id=$1",[schedule.id]);
  assert.deepEqual(await dispatchDueSourceUpdates(admin,runtime),{submitted:[],errors:[]});
  await withAccess(scope,()=>new SourceUpdates(runtime!).stage({datasetId:schedule.dataset_id,sourceName:'SYNTHETIC',sourceUrl:'https://example.org/source',observedAt:'2026-10-12T00:00:00Z',records:[{id:'US123B1',title:'Pending source fixture'}]},dispatched.submitted[0]));
  await admin.query("UPDATE runs SET payload=payload||'{\"status\":\"failed\"}'::jsonb WHERE id=$1",[dispatched.submitted[0]]);
  await admin.query("UPDATE jobs SET state='failed' WHERE run_id=$1",[dispatched.submitted[0]]);
  assert.deepEqual(await dispatchDueSourceUpdates(admin,runtime),{submitted:[],errors:[]},'unconfirmed source snapshot blocks new automatic downloads even after failure');
  await withAccess(scope,async()=>{
   const store=new SourceUpdateSchedules(runtime!);assert.equal((await store.list())[0].last_run_id,dispatched.submitted[0]);
   await store.save({params:schedule.params,intervalHours:12,enabled:false});
  });
  assert.deepEqual(await dispatchDueSourceUpdates(admin,runtime),{submitted:[],errors:[]});
  const {resolveSourceUpdate}=await import('../src/server/source-update-job');
  const {MonitorSubscriptions}=await import('../src/server/monitor-subscriptions');
  const {dispatchDueMonitors}=await import('../src/server/monitor-scheduler');
  const {MonitorNotifications}=await import('../src/server/monitor-notifications');
  const {JobStore}=await import('../src/server/job-store');
  const {executeNextJob}=await import('../src/server/job-worker');
  const {executeQueuedRun}=await import('../src/server/queued-agent');
  const queue=new JobStore(admin),signal=new AbortController().signal;
  const work=()=>executeNextJob({queue,workerId:'schedule-integration',signal,execute:executeQueuedRun});
  const subscription=await withAccess(scope,async()=>{
   await resolveSourceUpdate(runtime!,dispatched.submitted[0],{resolutions:[]});
   const subscriptions=new MonitorSubscriptions(runtime!);
   const row=await subscriptions.create({datasetId:schedule.dataset_id,name:'Synthetic source monitor',intervalHours:24,params:{query:'source',strategy_id:'source-fixture'}});
   await subscriptions.submit(row.id,'fixture');return row;
  });
  assert.equal(await work(),true);
  assert.equal((await withAccess(scope,()=>new MonitorNotifications(runtime!).list())).total,0,'initial baseline is not an added-patent alert');
  await withAccess(scope,()=>new SourceUpdateSchedules(runtime!).save({params:schedule.params,intervalHours:24,enabled:true}));
  const next=await dispatchDueSourceUpdates(admin,runtime);assert.equal(next.submitted.length,1);
  await withAccess(scope,()=>new SourceUpdates(runtime!).stage({datasetId:schedule.dataset_id,sourceName:'SYNTHETIC',sourceUrl:'https://example.org/source',observedAt:'2026-10-12T01:00:00Z',records:[{id:'US123B1',title:'Updated source fixture'}]},next.submitted[0]));
  assert.equal(await work(),true,'queued source task applies its durable snapshot');
  const monitors=await dispatchDueMonitors(admin,runtime,'fixture');assert.deepEqual(monitors.errors,[]);assert.equal(monitors.submitted.length,1,'source revision triggers before 24-hour interval');
  assert.equal(await work(),true);
  const notices=await withAccess(scope,()=>new MonitorNotifications(runtime!).list());assert.equal(notices.total,1);assert.equal(notices.notifications[0].subscription_id,subscription.id);assert.equal(notices.notifications[0].snapshot.brief.counts.updated,1);
  assert.deepEqual(await dispatchDueMonitors(admin,runtime,'fixture'),{submitted:[],errors:[]},'same source revision is consumed once');
 }finally{
  (globalThis as unknown as {patentPool?:ReturnType<typeof postgresPool>}).patentPool=undefined;
  await runtime?.end();await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();
 }
});
