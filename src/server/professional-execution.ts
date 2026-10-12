import {z} from 'zod';
import type {Job} from './job-store';
import type {Run} from '../lib/types';
import {db,event,saveRun} from './db';
import {connection,transaction} from './postgres';
import {ProfessionalStore} from './professional-store';
import {prepareResearchScope,prepareCandidateScope} from './professional-preparation';
import {executeLandscapeAnalysis} from './professional-analysis';
import {prepareLandscapeEvidence} from './professional-evidence';
import {writeLandscapeReport} from './professional-report';
import {prepareEntityMapping} from './professional-entities';
import {executeCompetitionAnalysis} from './professional-competition';
import {prepareProposalFeatures,prepareNoveltyStrategies} from './professional-novelty';
import {executeNoveltyRetrieval} from './novelty-retrieval';
import {prepareNoveltyComparison} from './professional-comparison';
import {writeNoveltyReport} from './novelty-report';
import {prepareLayoutExtraction,prepareLayoutLabels,prepareLayoutDirections} from './professional-layout';
import {writeLayoutReport} from './layout-report';

export async function executeProfessionalStage(job:Job,run:Run,signal:AbortSignal){
 const payload=z.object({taskId:z.string().min(1),stage:z.enum(['scope','retrieval','analysis','evidence','report','entities','features','strategies','comparison','extraction','labels','directions'])}).parse(job.payload);
 const tasks=new ProfessionalStore(db);
 const already=await tasks.get(payload.taskId);
 if(!already||already.execution_run_id!==run.id)throw new Error('专业阶段执行记录已改变');
 const existing=already.artifacts.findLast((a:{stage:string;status:string})=>a.stage===payload.stage&&a.status!=='stale');
 if(existing){if(['analysis','evidence','report'].includes(payload.stage)&&existing.status==='proposed')await tasks.confirm(payload.taskId,payload.stage,existing.revision);return;}
 await transaction(db,async client=>{
  const updated=await client.query("UPDATE professional_tasks SET status='running',updated_at=now() WHERE id=$1 AND execution_run_id=$2 AND status IN('queued','running') RETURNING id",[payload.taskId,run.id]);
  if(!updated.rowCount)throw new Error('专业任务当前状态不可执行');
 });
 signal.throwIfAborted();
 if(already.workflow==='patent-layout'&&payload.stage==='report'){
  const artifact=await writeLayoutReport(db,payload.taskId,run,signal);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='patent-layout'&&payload.stage==='directions'){
  const artifact=await prepareLayoutDirections(db,payload.taskId,run,signal);
  run.answer='候选方向与实际补检索结果已保存，等待确认；未命中不代表专利空白。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='patent-layout'&&payload.stage==='labels'){
  const artifact=await prepareLayoutLabels(db,payload.taskId,run,signal);
  run.answer='原始布局标签已准备，等待保留、排除及合并确认；尚未生成候选研发方向。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='patent-layout'&&payload.stage==='extraction'){
  await event(run.id,'status',{phase:'Extraction',message:'正在逐段读取全部确认候选的技术措施与效果'});
  const artifact=await prepareLayoutExtraction(db,payload.taskId,run,signal);
  run.answer='布局原始关系与证据已保存，等待确认；未检出关系的文献仍计入已处理候选。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='novelty-search'&&payload.stage==='report'){
  const artifact=await writeNoveltyReport(db,payload.taskId,run,signal);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='novelty-search'&&payload.stage==='comparison'){
  const artifact=await prepareNoveltyComparison(db,payload.taskId,run,signal);
  run.answer='逐特征证据对比已保存，等待核对确认。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(already.workflow==='novelty-search'&&payload.stage==='retrieval'){
  await event(run.id,'status',{phase:'Search',message:'正在执行确认的多策略查新检索'});
  const artifact=await executeNoveltyRetrieval(db,payload.taskId,run,signal);
  run.answer='查新候选与策略命中关联已保存，等待确认。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(payload.stage==='strategies'){
  await event(run.id,'status',{phase:'Strategies',message:'正在根据已确认特征准备查新检索策略'});
  const artifact=await prepareNoveltyStrategies(db,payload.taskId,signal,run.id);
  run.answer='查新策略已保存，等待编辑与确认。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 if(payload.stage==='features'){
  await event(run.id,'status',{phase:'Proposal',message:'正在提取技术方案特征并核对原文依据'});
  const artifact=await prepareProposalFeatures(db,payload.taskId,signal,run.id);
  run.answer='技术方案特征已保存，等待核对与确认。';await saveRun(run);
  await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});return;
 }
 await event(run.id,'status',{phase:payload.stage==='scope'?'Scope':payload.stage==='analysis'?'Analysis':'Search',message:payload.stage==='scope'?'正在检查研究范围、计数口径与原文质量':payload.stage==='analysis'?'正在执行已确认范围的技术全景统计':'正在已确认范围内准备候选文献'});
 const artifact=payload.stage==='entities'?await prepareEntityMapping(db,payload.taskId,signal,run.id):payload.stage==='scope'?await prepareResearchScope(db,payload.taskId,signal,run.id):payload.stage==='retrieval'?await prepareCandidateScope(db,payload.taskId,signal,run.id):payload.stage==='analysis'?already.workflow==='competitor-analysis'?await executeCompetitionAnalysis(db,payload.taskId,run,signal):await executeLandscapeAnalysis(db,payload.taskId,run,signal):payload.stage==='evidence'?await prepareLandscapeEvidence(db,payload.taskId,run,signal):await writeLandscapeReport(db,payload.taskId,run,signal);
 if(payload.stage!=='report')run.answer=payload.stage==='entities'?'主体名称候选已保存，等待确认别名。':payload.stage==='scope'?'研究范围准备完成，等待确认。':payload.stage==='retrieval'?'候选文献准备完成，等待确认。':payload.stage==='evidence'?'代表证据已保存，可继续生成技术全景报告。':'技术全景统计已保存，可继续整理代表证据。';await saveRun(run);
 await event(run.id,'professional-artifact',{taskId:payload.taskId,stage:payload.stage,revision:artifact.revision});
}

export async function finishProfessionalExecution(runId:string,status:'failed'|'cancelled'){
 await connection(db).query("UPDATE professional_tasks SET status=$2,updated_at=now() WHERE execution_run_id=$1 AND status IN('queued','running')",[runId,status]);
}
