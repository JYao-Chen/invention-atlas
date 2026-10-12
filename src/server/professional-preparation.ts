import type {Pool} from 'pg';
import {professionalInput} from './professional-workflows';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {transaction} from './postgres';
import {executeTool,scope} from './tools';
import {datasetAuditAsync} from './research';
import {z} from 'zod';
import {entityMapping} from './professional-entities';

export async function prepareCandidateScope(pool:Pool,taskId:string,signal:AbortSignal,executionRunId:string){
 const tasks=new ProfessionalStore(pool),task=await tasks.get(taskId);
 if(!task||task.status!=='running'||task.current_stage!=='retrieval'||task.execution_run_id!==executionRunId)throw new Error('当前任务不在候选检索阶段');
 const input=professionalInput.parse(task.input);
 const artifact=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='scope'&&a.status==='confirmed');
 if(!artifact)throw new Error('缺少已确认的研究范围');
 const approved=z.object({patentIds:z.array(z.string()).min(1),conditions:z.object({counting:z.enum(['publication','family'])})}).passthrough().parse(artifact.data);
 const store=new PostgresStore(pool),meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
 const records=await store.analysisPatents(meta.id),ids=new Set(approved.patentIds),selected=records.filter(p=>ids.has(p.id));
 if(selected.length!==ids.size)throw new Error('已确认范围中的记录发生删除，请重新准备范围');
 signal.throwIfAborted();
 const result=input.query?await executeTool('search_patents',{query:input.query,top_k:100,counting:'publication'},meta,selected,{signal,semantic:true}):undefined;
 if(result&&result.status!=='completed')throw new Error(result.summary);
 if(result)await store.saveResult(result);
 const candidates=result?result.rows.map(row=>String(row.patent)):selected.map(p=>p.id);
 signal.throwIfAborted();
 return tasks.propose(taskId,'retrieval',{
  scopeRevision:artifact.revision,patentIds:candidates,candidateIds:candidates,query:input.query||'',searchResult:result||null,
  counting:approved.conditions.counting,availableRecords:selected.length,
  selectionMode:result?'ranked_candidates':'all_confirmed_records',
  notes:result?['检索最多保留100项候选，不是范围内全部相关专利；后续分析仅使用确认的候选集合。']:['未指定主题检索词，候选集保留全部已确认范围记录。'],
 },executionRunId);
}

export async function prepareResearchScope(pool:Pool,taskId:string,signal:AbortSignal,executionRunId?:string){
 return transaction(pool,async()=>{
  const tasks=new ProfessionalStore(pool),task=await tasks.get(taskId);
  if(!task)throw new Error('专业任务不存在');
  if(task.current_stage!=='scope'||!(executionRunId?task.status==='running'&&task.execution_run_id===executionRunId:task.status==='ready'))throw new Error('当前任务不在范围准备阶段');
  const input=professionalInput.parse(task.input),store=new PostgresStore(pool);
  const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
  signal.throwIfAborted();
  const params={year_start:input.yearStart,year_end:input.yearEnd,ipc:input.ipc,counting:input.counting};
  let all=await store.analysisPatents(meta.id);
  const entities=input.workflow==='competitor-analysis'?task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='entities'&&a.status==='confirmed'):undefined;
  if(input.workflow==='competitor-analysis'&&!entities)throw new Error('缺少已确认的主体名称');
  const mappings=entities?entityMapping.parse(entities.data.mappings):[];
  if(entities){const aliases=new Set(mappings.flatMap(group=>group.aliases));all=all.filter(p=>p.applicants.some(name=>aliases.has(name)));}
  const selected=scope(all,params);
  if(!selected.length)throw new Error('指定年份和分类范围没有专利，请修改范围');
  const summary=await executeTool('get_dataset_summary',params,meta,all);
  const issues=await datasetAuditAsync((async function*(){for(const record of selected){signal.throwIfAborted();yield await store.fullPatent(meta.id,record);}})());
  signal.throwIfAborted();
  return tasks.propose(taskId,'scope',{
   datasetSnapshot:meta,conditions:params,patentIds:selected.map(p=>p.id),summary,entityRevision:entities?.revision,entityMappings:mappings,
   ...(input.workflow==='patent-layout'?{objective:input.objective}:{}),
   qualityAudit:{checkedRecords:selected.length,issues},
   retrievalPending:Boolean(input.query),query:input.query||'',
   notes:input.query?['当前范围仅应用年份与分类条件，主题检索尚未执行；候选范围将在检索阶段确认。']:[],
  },executionRunId);
 },{repeatableRead:true});
}
