import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {executeTool,type ToolContext} from './tools';
import {confirmLayout} from './layout-confirmation';
import {suggestLayoutDirections,validateLayoutDirections} from './layout-directions';

export function layoutDirectionSearchPlan(directions:{query:string}[]){
 return [...new Set(directions.map(direction=>direction.query))].flatMap(query=>['search_patents','search_patent_passages'].map(tool=>({tool,params:{query,top_k:30,counting:'publication' as const}})));
}

export async function prepareLayoutExtraction(pool:Pool,taskId:string,run:Run,signal:AbortSignal,context:ToolContext={}){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='patent-layout'||task.current_stage!=='extraction'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在布局抽取阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
 const candidate=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='retrieval'&&a.status==='confirmed');
 if(!candidate)throw new Error('缺少已确认的布局候选');
 const selection=z.object({patentIds:z.array(z.string()).min(1),scopeRevision:z.number().int().positive()}).passthrough().parse(candidate.data);
 const ids=new Set(selection.patentIds),records=(await store.analysisPatents(input.datasetId)).filter(p=>ids.has(p.id));
 if(ids.size!==selection.patentIds.length||records.length!==ids.size)throw new Error('候选重复或记录已删除，请重新确认候选');
 const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('布局数据集不存在');
 run.scope={mode:'search',counting:'publication',patentIds:selection.patentIds,selections:[],notes:['仅抽取用户确认的候选；技术关系按公开件保留原文，不表示行业全集。']};
 run.plan=[{tool:'analyze_tech_matrix',params:{counting:'publication'}}];await store.saveRun(run);
 let result=run.results.find(r=>r.tool==='analyze_tech_matrix'&&r.status==='completed');
 if(!result){
  await store.event(run.id,'tool-start',{phase:'Extraction',tool:'analyze_tech_matrix'});
  result=await executeTool('analyze_tech_matrix',{counting:'publication'},meta,records,{...context,signal});
  signal.throwIfAborted();if(result.status!=='completed')throw new Error(result.summary);
  await store.saveResult(result);run.results.push(result);await store.saveRun(run);await store.event(run.id,'tool-result',{result});
 }
 if(result.datasetId!==input.datasetId||result.scope?.patentIds.length!==ids.size||result.scope.patentIds.some(id=>!ids.has(id)))throw new Error('保存的抽取结果与确认候选不一致');
 return tasks.propose(taskId,'extraction',{objective:input.objective,candidateRevision:candidate.revision,scopeRevision:selection.scopeRevision,patentIds:selection.patentIds,resultId:result.id,evidenceRows:result.rows.length,emptyReason:result.rows.length?null:'全部候选已处理，但没有提取到明确措施—效果关系；不能据此判定不存在相关技术。'},run.id);
}

export async function prepareLayoutDirections(pool:Pool,taskId:string,run:Run,signal:AbortSignal,suggest:typeof suggestLayoutDirections=suggestLayoutDirections){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='patent-layout'||task.current_stage!=='directions'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在布局方向阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const labels=confirmed('labels'),approvedScope=confirmed('scope');if(!labels||!approvedScope)throw new Error('缺少当前确认标签或研究范围');
 const source=await store.savedResult(labels.data.confirmation.resultId);if(!source||source.datasetId!==input.datasetId)throw new Error('布局原始结果不存在');
 const ids=new Set(z.array(z.string()).min(1).parse(approvedScope.data.patentIds)),records=(await store.analysisPatents(input.datasetId)).filter(p=>ids.has(p.id));
 if(records.length!==ids.size)throw new Error('布局研究范围记录发生删除，请重新确认');
 const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
 if(!run.layoutDirections){run.layoutDirections={labelRevision:labels.revision,suggestions:await suggest(source,labels.data.confirmation,signal)};signal.throwIfAborted();await store.saveRun(run);}
 if(run.layoutDirections.labelRevision!==labels.revision)throw new Error('已保存方向与标签版本不一致，请重新提交阶段');
 const suggestions=run.layoutDirections.suggestions;
 validateLayoutDirections(source,labels.data.confirmation,{directions:suggestions.directions.map(({title,function:fn,effect,hypothesis,evidenceRows,query,reason})=>({title,function:fn,effect,hypothesis,evidenceRows,query,reason})),unresolved:suggestions.unresolved});
 run.scope={mode:'search',counting:'publication',patentIds:[...ids],selections:[],notes:['补检索限于已确认研究范围，不限于原抽取候选；未命中不证明不存在相关专利。']};
 run.plan=layoutDirectionSearchPlan(suggestions.directions);await store.saveRun(run);
 const searches=[];
 for(const {tool,params:{query}} of run.plan){
  signal.throwIfAborted();let result=run.results.find(r=>r.tool===tool&&r.params.query===query&&r.status!=='failed');
  if(!result){await store.event(run.id,'tool-start',{phase:'Directions',tool});result=await executeTool(tool,{query,top_k:30,counting:'publication'},meta,records,{signal,semantic:true});signal.throwIfAborted();await store.saveResult(result);run.results.push(result);await store.saveRun(run);await store.event(run.id,'tool-result',{result});}
  searches.push({query,tool,resultId:result.id,status:result.status,returned:result.rows.length,summary:result.summary});
 }
 return tasks.propose(taskId,'directions',{labelRevision:labels.revision,scopeRevision:approvedScope.revision,suggestions,searches,availableSuggestions:suggestions,availableSearches:searches,searchPatentIds:[...ids],notes:['检索至多返回30项；不能将未命中或段落索引不可用解释为技术不存在。','候选方向仍为模型辅助研究假设，没有进行可申请性或自由实施判断。']},run.id);
}

export async function prepareLayoutLabels(pool:Pool,taskId:string,run:Run,signal:AbortSignal){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='patent-layout'||task.current_stage!=='labels'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在布局标签阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
 const extraction=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='extraction'&&a.status==='confirmed');
 if(!extraction)throw new Error('缺少已确认原始抽取');
 const source=await store.savedResult(z.string().parse(extraction.data.resultId));
 if(!source||source.datasetId!==input.datasetId||!source.layoutMatrix)throw new Error('布局原始结果不存在');
 if(!source.rows.length)throw new Error('没有已观测关系可确认标签，请修改候选范围或补充原文；不将无关系解释为专利空白');
 const confirmation={resultId:source.id,objective:input.objective,functions:source.layoutMatrix.functions.map(label=>({source:label,label,include:true})),effects:source.layoutMatrix.effects.map(label=>({source:label,label,include:true}))};
 const confirmed=confirmLayout(source,confirmation);
 signal.throwIfAborted();
 return tasks.propose(taskId,'labels',{extractionRevision:extraction.revision,confirmation,confirmed},run.id);
}
