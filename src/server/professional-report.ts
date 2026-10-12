import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run,AnalysisResult,Dataset} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {chat} from './model';
import {reportResult,reportDataset,reportScope} from './report-input';
import {runTextWriter} from './run-text';
import {REPORT_WRITING_GUIDANCE,prepareReport} from './report-preparation';

export function validateReportCharts(answer:string,results:AnalysisResult[]){
 const references=[...answer.matchAll(/\[\[chart:([a-zA-Z0-9-]+)\]\]/g)].map(match=>match[1]);
 if(references.length!==(answer.match(/\[\[chart:/g)||[]).length)throw new Error('报告存在格式不完整的图表引用，请重试报告');
 const unresolved=references.filter(id=>!results.some(result=>result.id===id));
 if(unresolved.length)throw new Error('报告引用了未保存的图表：'+[...new Set(unresolved)].join('、'));
}

export async function writeLandscapeReport(pool:Pool,taskId:string,run:Run,signal:AbortSignal,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||!['technology-landscape','competitor-analysis'].includes(task.workflow)||task.current_stage!=='report'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在专业报告阶段');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const scope=confirmed('scope'),candidate=confirmed('retrieval'),analysis=confirmed('analysis'),evidence=confirmed('evidence');
 if(!scope||!candidate||!analysis||!evidence)throw new Error('缺少已确认的阶段产物');
 const data=z.object({resultIds:z.array(z.string()),patentIds:z.array(z.string()),counting:z.enum(['publication','family']),candidateRevision:z.number().int()}).passthrough().parse(analysis.data);
 if(candidate.data.scopeRevision!==scope.revision||data.candidateRevision!==candidate.revision||evidence.data.analysisRevision!==analysis.revision)throw new Error('阶段依赖版本不一致，请重新准备下游产物');
 const entities=task.workflow==='competitor-analysis'?confirmed('entities'):undefined;
 if(task.workflow==='competitor-analysis'&&(!entities||scope.data.entityRevision!==entities.revision||analysis.data.entityRevision!==entities.revision))throw new Error('竞争主体版本不一致');
 const results:AnalysisResult[]=[];
 for(const id of data.resultIds){const result=await store.savedResult(id);if(!result||result.datasetId!==task.input.datasetId)throw new Error('报告关联统计结果不存在');results.push(result);}
 const scopeSummary=scope.data.summary as AnalysisResult;
 if(!scopeSummary||scopeSummary.tool!=='get_dataset_summary'||scopeSummary.datasetId!==task.input.datasetId)throw new Error('范围概况结果不存在');
 if(!results.some(result=>result.id===scopeSummary.id)){await store.saveResult(scopeSummary);results.unshift(scopeSummary);}
 const records=(await store.analysisPatents(task.input.datasetId)).filter(p=>data.patentIds.includes(p.id));
 if(records.length!==new Set(data.patentIds).size)throw new Error('范围记录已删除，请重新准备范围');
 run.results=results;run.scope={mode:'search',counting:data.counting,patentIds:data.patentIds,selections:[],notes:['用户已确认的专业任务候选范围。']};
 run.datasetSnapshot=scope.data.datasetSnapshot as Dataset;
 run.reportPreparation=prepareReport(run,records);run.answer='';await store.saveRun(run);
 await store.event(run.id,'text-reset',{});await store.event(run.id,'status',{phase:'Report',message:'统计与证据已确认，正在流式生成技术全景报告'});
 const context={workflow:task.workflow,workflowVersion:task.workflow_version,input:task.input,revisions:{scope:scope.revision,candidates:candidate.revision,analysis:analysis.revision,evidence:evidence.revision},dataset:reportDataset(run.datasetSnapshot),scope:reportScope(run.scope),scopeSummary:reportResult(scope.data.summary as AnalysisResult),results:results.map(reportResult),evidence:evidence.data,preparation:run.reportPreparation,writingGuidance:REPORT_WRITING_GUIDANCE,countingDefinition:{publication:'按公开编号计件，不是公开日；公开日期仅用于按年分组。',family:'按来源同族标识去重；缺少标识的记录独立保留。'},coverageDefinition:'dataset描述整个专题库，scopeSummary描述范围筛选后的记录；二者不得混用。年份覆盖不代表全年数据完整。'};
 Object.assign(context,{entityRevision:entities?.revision,entityMappings:entities?.data.mappings,targets:analysis.data.targets,targetNotes:analysis.data.notes});
 const writer=runTextWriter(run,store.event.bind(store),store.saveRun.bind(store));
 await write('根据已确认的专业任务阶段产物撰写中文报告。technology-landscape 是技术全景，讨论研究范围、公开态势、技术分类与主题、申请人、代表文献和限制；competitor-analysis 是指定主体比较，讨论确认名称、主体组合、年度演化、合作与代表专利。竞争分析 targets 才是用户指定主体，其他申请人仅为关联合作方；matched=false 表示名称未匹配，不能解释为该企业没有专利。主体计数可能重合，不可求和当总数。具体标题随结果组织，不写宣传话术。所有数值来自工具结果；数据集概况与候选范围分开说明。只允许引用 evidence.documents 中有逐行 links 的代表专利，不能从范围编号预览补选。excerpts 是原文阅读片段而非技术特征匹配证据，省略量不表示缺失。工具 unavailable 或 failed 必须说明。使用 [[chart:结果id]] 将相应工具图表插入讨论段落之后，每个结果只引用一次。公式用 LaTeX 数学分隔符。样本数量、TF-IDF与专利质量、技术重要性、市场份额不等价。逐字引文需对应给定片段与来源。不得扩大范围，不重新规划工具，不输出JSON。',JSON.stringify(context),{signal,maxTokens:12000,onDelta:text=>writer.push(text)});
 await writer.flush();signal.throwIfAborted();
 validateReportCharts(run.answer,results);
 const artifact=await tasks.propose(taskId,'report',{answer:run.answer,resultIds:results.map(result=>result.id),sourceRevisions:context.revisions,runId:run.id},run.id);
 await tasks.confirm(taskId,'report',artifact.revision);return artifact;
}
