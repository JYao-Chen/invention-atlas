import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {db} from '../src/server/db';
import {assertRuntimeRole,postgresPool} from '../src/server/postgres';
import {JobStore} from '../src/server/job-store';
import {executeNextJob} from '../src/server/job-worker';
import {executeQueuedRun,cancelQueuedRun} from '../src/server/queued-agent';
import {dispatchDueMonitors} from '../src/server/monitor-scheduler';
import {dispatchDueSourceUpdates} from '../src/server/source-update-schedules';
import {modelConfig} from '../src/server/config';

if(!process.env.QUEUE_DATABASE_URL)throw new Error('后台进程需要独立的 QUEUE_DATABASE_URL 任务维护连接');
const queuePool=postgresPool(process.env.QUEUE_DATABASE_URL);
const shutdown=new AbortController();
const workerId='agent-'+randomUUID();
const stop=()=>shutdown.abort();
process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{
 await assertRuntimeRole(db);
 const permission=await queuePool.query("SELECT r.rolsuper OR r.rolbypassrls OR c.relowner=r.oid AS can_maintain FROM pg_roles r JOIN pg_class c ON c.relname='jobs' JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=current_schema() WHERE r.rolname=current_user");
 if(!permission.rows[0]?.can_maintain)throw new Error('任务维护连接必须能够跨项目领取队列任务');
 const queue=new JobStore(queuePool);
 console.log('Agent worker ready:',workerId);
 let nextMonitorScan=0;
 while(!shutdown.signal.aborted){
  if(Date.now()>=nextMonitorScan){
   const sources=await dispatchDueSourceUpdates(queuePool,db);
   for(const error of sources.errors)console.error('Source schedule failed:',error.id,error.message);
   const scheduled=await dispatchDueMonitors(queuePool,db,modelConfig().model);
   for(const error of scheduled.errors)console.error('Monitor subscription failed:',error.id,error.message);
   nextMonitorScan=Date.now()+30000;
  }
  const worked=await executeNextJob({queue,workerId,signal:shutdown.signal,execute:executeQueuedRun,onCancelled:cancelQueuedRun});
  if(!worked)await delay(500,undefined,{signal:shutdown.signal});
 }
}catch(error){
 if(!shutdown.signal.aborted){console.error('Agent worker failed:',(error as Error).message);process.exitCode=1;}
}finally{
 process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
 await Promise.all([queuePool.end(),db.end()]);
}
