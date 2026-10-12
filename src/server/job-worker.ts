import {withAccess} from './postgres';
import {jobAccess,type Job,type JobStore} from './job-store';

type Queue=Pick<JobStore,'claim'|'heartbeat'|'get'|'finish'>;
export async function executeNextJob(options:{queue:Queue;workerId:string;execute:(job:Job,signal:AbortSignal)=>Promise<void>;onCancelled?:(job:Job)=>Promise<void>;signal:AbortSignal;leaseSeconds?:number;heartbeatMs?:number}){
 const {queue,workerId,signal}=options;
 signal.throwIfAborted();
 const leaseSeconds=options.leaseSeconds||60,job=await queue.claim(workerId,leaseSeconds);
 if(!job)return false;
 const control=new AbortController();let lost=false,cancelled=false,pulsing=false;
 const shutdown=()=>control.abort(new Error('执行进程正在退出，任务等待租约回收'));
 signal.addEventListener('abort',shutdown,{once:true});if(signal.aborted)shutdown();
 const pulse=async()=>{
  if(pulsing||control.signal.aborted)return;
  pulsing=true;
  try{
   const current=await queue.get(job.id);
   if(current?.cancelRequested){cancelled=true;control.abort(new Error('任务已取消'));return;}
   if(!await queue.heartbeat(job.id,workerId,leaseSeconds)){lost=true;control.abort(new Error('任务租约或执行权限已失效'));}
  }catch(error){lost=true;control.abort(error);}finally{pulsing=false;}
 };
 const timer=setInterval(()=>void pulse(),options.heartbeatMs||Math.floor(leaseSeconds*1000/3));
 try{
  await pulse();control.signal.throwIfAborted();
  await withAccess(jobAccess(job),()=>options.execute(job,control.signal));
  await pulse();control.signal.throwIfAborted();
  if(!await queue.finish(job.id,workerId,'completed'))throw new Error('任务完成时租约已失效');
 }catch(error){
  if(!signal.aborted&&!lost){
   if(cancelled&&options.onCancelled)await withAccess(jobAccess(job),()=>options.onCancelled!(job));
   await queue.finish(job.id,workerId,cancelled?'cancelled':'failed',(error as Error).message);
  }
  // Shutdown and lost leases are reclaimed, not marked complete by a stale executor.
 }finally{clearInterval(timer);signal.removeEventListener('abort',shutdown);}
 return true;
}
