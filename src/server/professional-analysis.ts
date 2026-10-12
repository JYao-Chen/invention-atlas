import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run,Params} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {executeTool} from './tools';

export async function executeLandscapeAnalysis(pool:Pool,taskId:string,run:Run,signal:AbortSignal){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='technology-landscape'||task.current_stage!=='analysis'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在技术全景分析阶段');
 const input=professionalInput.parse(task.input),approved=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='retrieval'&&a.status==='confirmed');
 if(!approved)throw new Error('缺少已确认的候选集合');
 const selection=z.object({patentIds:z.array(z.string()).min(1),counting:z.enum(['publication','family']),scopeRevision:z.number().int().positive()}).passthrough().parse(approved.data);
 const ids=new Set(selection.patentIds),records=(await store.analysisPatents(input.datasetId)).filter(p=>ids.has(p.id));
 if(records.length!==ids.size)throw new Error('候选记录发生删除，请重新准备研究范围');
 const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
 run.scope={mode:'search',counting:selection.counting,patentIds:records.map(p=>p.id),selections:[],notes:['专业流程中用户已确认的候选集合，不代表行业全集。']};
 const definitions:{tool:string;params:Params}[]=[
  {tool:'analyze_patent_trend',params:{counting:selection.counting}},
  {tool:'analyze_ipc_distribution',params:{counting:selection.counting,top_k:30}},
  {tool:'analyze_yearly_keywords',params:{counting:selection.counting,top_k:10}},
  {tool:'analyze_clustering',params:{counting:selection.counting,k:Math.min(6,Math.max(2,records.length))}},
  {tool:'analyze_entity_portfolio',params:{counting:selection.counting,top_k:30}},
 ];
 run.plan=definitions;await store.saveRun(run);
 for(const step of definitions){
  signal.throwIfAborted();if(run.results.some(r=>r.tool===step.tool&&r.status!=='failed'))continue;
  await store.event(run.id,'tool-start',{phase:'Analysis',tool:step.tool});
  const result=await executeTool(step.tool,step.params,meta,records,{signal});
  signal.throwIfAborted();await store.saveResult(result);run.results.push(result);await store.saveRun(run);await store.event(run.id,'tool-result',{result});
 }
 const artifact=await tasks.propose(taskId,'analysis',{
  candidateRevision:approved.revision,scopeRevision:selection.scopeRevision,patentIds:records.map(p=>p.id),counting:selection.counting,
  resultIds:run.results.map(r=>r.id),toolStatuses:run.results.map(r=>({tool:r.tool,status:r.status,summary:r.summary})),
 },run.id);
 await tasks.confirm(taskId,'analysis',artifact.revision);
 return artifact;
}
