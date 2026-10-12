import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run,Params} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {entityMapping} from './professional-entities';
import {executeTool} from './tools';
import {governedRecords} from './research';

export async function executeCompetitionAnalysis(pool:Pool,taskId:string,run:Run,signal:AbortSignal){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='competitor-analysis'||task.current_stage!=='analysis'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在竞争主体分析阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='competitor-analysis')throw new Error('任务类型不匹配');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const entities=confirmed('entities'),scope=confirmed('scope'),candidate=confirmed('retrieval');if(!entities||!scope||!candidate)throw new Error('缺少已确认的主体与范围');
 if(scope.data.entityRevision!==entities.revision||candidate.data.scopeRevision!==scope.revision)throw new Error('主体与范围版本不一致');
 const mappings=entityMapping.parse(entities.data.mappings),selection=z.object({patentIds:z.array(z.string()).min(1),counting:z.enum(['publication','family'])}).parse(candidate.data);
 const ids=new Set(selection.patentIds),records=(await store.analysisPatents(input.datasetId)).filter(p=>ids.has(p.id));if(records.length!==ids.size)throw new Error('候选记录已删除，请重新确认范围');
 const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
 const rules=mappings.flatMap(group=>group.aliases.map(alias=>({alias,canonical:group.entity,basis:'用户确认的主体别名，第'+entities.revision+'版'})));
 run.scope={mode:'search',counting:selection.counting,patentIds:records.map(p=>p.id),selections:[],notes:['用户确认的竞争主体候选集合，合作方可能同时出现在工具分布中。']};
 const steps:{tool:string;params:Params}[]=['analyze_entity_portfolio','analyze_competitor_evolution','analyze_co_network'].map(tool=>({tool,params:{counting:selection.counting,top_k:100,dimension:'applicant'}}));
 run.plan=steps;await store.saveRun(run);
 for(const step of steps){
  signal.throwIfAborted();if(run.results.some(result=>result.tool===step.tool&&result.status!=='failed'))continue;
  await store.event(run.id,'tool-start',{phase:'Competition',tool:step.tool});
  const result=await executeTool(step.tool,step.params,meta,records,{signal,entityRules:rules});signal.throwIfAborted();
  await store.saveResult(result);run.results.push(result);await store.saveRun(run);await store.event(run.id,'tool-result',{result});
 }
 const targets=mappings.map(group=>{
  const source=records.filter(p=>p.applicants.some(name=>group.aliases.includes(name))),counted=governedRecords(source,[],selection.counting).records;
  return {entity:group.entity,aliases:group.aliases,matched:group.aliases.length>0,publicationRecords:source.length,countedRecords:counted.length,patentIds:source.map(p=>p.id)};
 });
 const artifact=await tasks.propose(taskId,'analysis',{entityRevision:entities.revision,candidateRevision:candidate.revision,scopeRevision:scope.revision,patentIds:records.map(p=>p.id),counting:selection.counting,resultIds:run.results.map(r=>r.id),toolStatuses:run.results.map(r=>({tool:r.tool,status:r.status,summary:r.summary})),targets,notes:['各主体可共同拥有同一公开件，主体计数之和不能作为去重总量。','组合与合作网络可包括关联合作方；targets 才是用户指定的比较主体。未匹配主体不能解释为没有专利。']},run.id);
 await tasks.confirm(taskId,'analysis',artifact.revision);return artifact;
}
