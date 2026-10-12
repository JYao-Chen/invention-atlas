import {z} from 'zod';
import type {Pool} from 'pg';
import type {AnalysisResult,Run} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {chunkPatent} from './patent-chunks';

export function representativeSelection(results:AnalysisResult[],allowed:string[],limit=20){
 const scope=new Set(allowed),lists=results.map(result=>[...new Set((result.rowSources||[]).flatMap(row=>row.representatives.map(rep=>rep.patent)).filter(id=>scope.has(id)))]);
 const all=new Set(lists.flat()),selected=new Set<string>();
 for(let position=0;selected.size<limit&&lists.some(list=>position<list.length);position++)for(const list of lists){const id=list[position];if(id)selected.add(id);if(selected.size===limit)break;}
 return {patentIds:[...selected],linkedRepresentatives:all.size,omittedRepresentatives:all.size-selected.size};
}

export async function prepareLandscapeEvidence(pool:Pool,taskId:string,run:Run,signal:AbortSignal){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||!['technology-landscape','competitor-analysis'].includes(task.workflow)||task.current_stage!=='evidence'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在证据整理阶段');
 const input=professionalInput.parse(task.input),analysis=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='analysis'&&a.status==='confirmed');
 if(!analysis)throw new Error('缺少已保存的统计产物');
 const source=z.object({resultIds:z.array(z.string()),patentIds:z.array(z.string()),counting:z.enum(['publication','family'])}).passthrough().parse(analysis.data);
 const results:AnalysisResult[]=[];
 for(const id of source.resultIds){const result=await store.savedResult(id);if(!result||result.datasetId!==input.datasetId)throw new Error('关联统计结果不存在');results.push(result);}
 const selection=representativeSelection(results,source.patentIds),documents=[];
 for(const id of selection.patentIds){
  signal.throwIfAborted();const patent=await store.patent(input.datasetId,id);if(!patent)throw new Error('代表专利已删除，请重新分析');
  const chunks=chunkPatent(patent,taskId+':analysis-'+analysis.revision),sections=['abstract','claim','description'] as const;
  const excerpts=sections.flatMap(section=>{const first=chunks.find(chunk=>chunk.section===section);return first?[first]:[];});
  const links=results.flatMap(result=>(result.rowSources||[]).filter(row=>row.representatives.some(rep=>rep.patent===id)).map(row=>({resultId:result.id,tool:result.tool,row:row.row,word:row.word,year:row.year})));
  documents.push({patent:id,title:patent.title,sourceUrl:patent.sourceUrl,links,excerpts,availableChunks:chunks.length,omittedChunks:chunks.length-excerpts.length});
  await store.event(run.id,'progress',{tool:'evidence',done:documents.length,total:selection.patentIds.length,unit:'代表专利原文阅读'});
 }
 run.results=results;run.scope={mode:'search',counting:source.counting,patentIds:source.patentIds,selections:[],notes:['用户确认的候选范围；代表文献来自统计逐行关联。']};await store.saveRun(run);
 const artifact=await tasks.propose(taskId,'evidence',{analysisRevision:analysis.revision,resultIds:source.resultIds,...selection,documents,notes:['摘要、权利要求和说明书各保留首个阅读片段，未进行逐技术特征的相关性判定。','片段省略数量已记录；不能把阅读片段当作完整全文。']},run.id);
 await tasks.confirm(taskId,'evidence',artifact.revision);return artifact;
}
