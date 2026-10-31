import {executeDeepResearch} from './deep-research-engine';
import {DeepResearchStore} from './deep-research-store';
import {z} from 'zod';
import type {Job} from './job-store';
import {run,analysisPatents,saveRun,finishRun,event} from './db';
import {executeRun,generateReport} from './agent';
import {stepSchema} from './planning';
import {executeProfessionalStage,finishProfessionalExecution} from './professional-execution';
import {executeFulltextIndex} from './fulltext-job';
import {db} from './db';
import {publishMonitorNotification} from './monitor-notifications';
import {transaction} from './postgres';
import {executeSourceUpdate} from './source-update-job';
import {executeMaterialOcr} from './material-ocr-job';
import {withModelRun} from './model-usage';
import {withOrganizationModel} from './organization-model';
import {modelConfig} from './config';

const submission=z.object({forced:z.array(stepSchema).min(1).max(30).optional(),toolOnly:z.boolean().default(false)});

export async function executeQueuedRun(job:Job,signal:AbortSignal){
 return withOrganizationModel(db,()=>job.runId?withModelRun(job.runId,()=>executeQueuedRunBody(job,signal)):executeQueuedRunBody(job,signal));
}
async function executeQueuedRunBody(job:Job,signal:AbortSignal){
 if(job.kind==='material-ocr'){await executeMaterialOcr(db,job,signal);return;}
 const r=await run(job.runId);
 if(!r)throw new Error('任务对应的运行不存在或已撤销访问权限');
 r.model=modelConfig().model;
 if(job.kind==='research'){try{await executeDeepResearch(db,r,signal);}catch(error){if(!signal.aborted&&r.status==='running'){await new DeepResearchStore(db).status(r.id,'failed',(error as Error).message);r.status='interrupted';r.error=(error as Error).message;await saveRun(r);}throw error;}return;}
 // A process may exit after committing the report but before completing its lease.
 if(r.status!=='running'){
  if(['completed','partial','failed'].includes(r.status)&&typeof job.payload.monitorSubscriptionId==='string')await publishMonitorNotification(db,job.payload.monitorSubscriptionId,r);
  return;
 }
 try{
  signal.throwIfAborted();
  if(job.attempts>1){
   await event(r.id,'status',{phase:'Recovery',message:'正在从已保存的分析阶段恢复任务'});
   // Keep the saved answer visible while an interrupted report is rebuilt.
  }
  if(job.kind==='source-update')await executeSourceUpdate(db,job,r,signal);
  else if(job.kind==='fulltext')await executeFulltextIndex(db,job,r,signal);
  else if(job.kind==='professional')await executeProfessionalStage(job,r,signal);
  else if(job.kind==='report'){const replacing=Boolean(r.answer);await generateReport(r,await analysisPatents(r.datasetId),signal);if(replacing)await event(r.id,'text-snapshot',{text:r.answer});}
  else{const payload=submission.parse(job.payload);await executeRun(r,payload.forced,payload.toolOnly,signal);}
  signal.throwIfAborted();
  r.status=r.results.some(result=>result.status!=='completed')?'partial':'completed';
  await transaction(db,async()=>{
   await finishRun(r);
   if(typeof job.payload.monitorSubscriptionId==='string')await publishMonitorNotification(db,job.payload.monitorSubscriptionId,r);
  });
 }catch(error){
  if(signal.aborted)throw error;
  r.status=r.results.some(result=>result.status==='completed')?'partial':'failed';
  if(job.kind==='professional')await finishProfessionalExecution(r.id,'failed');
  r.error=(error as Error).message;
  await transaction(db,async()=>{await finishRun(r);if(typeof job.payload.monitorSubscriptionId==='string')await publishMonitorNotification(db,job.payload.monitorSubscriptionId,r);});
  throw error;
 }
}

export async function cancelQueuedRun(job:Job){
 if(job.kind==='material-ocr')return;
 const r=await run(job.runId);
 if(!r||r.status!=='running')return;
 if(job.kind==='research'){await new DeepResearchStore(db).status(r.id,'paused');r.status='interrupted';r.error='';await saveRun(r);return;}
 if(job.kind==='professional')await finishProfessionalExecution(r.id,'cancelled');
 r.status='cancelled';r.error='任务已取消';await finishRun(r);
}
