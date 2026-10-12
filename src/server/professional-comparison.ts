import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {validateProposalArtifact} from './proposal-features';
import {chunkPatent} from './patent-chunks';
import {compareProposalFeatures} from './novelty-comparison';
import {chat} from './model';
import {isDeepStrictEqual} from 'node:util';
import {modelConfig} from './config';

export async function prepareNoveltyComparison(pool:Pool,taskId:string,run:Run,signal:AbortSignal,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='novelty-search'||task.current_stage!=='comparison'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在逐特征对比阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='novelty-search')throw new Error('任务类型不匹配');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const features=confirmed('features'),candidates=confirmed('retrieval');
 if(!features||!candidates||candidates.data.featureRevision!==features.revision)throw new Error('缺少当前版本确认的特征和候选文献');
 const source=validateProposalArtifact(input.proposal,features.data),ids=candidates.data.patentIds as string[];
 if(!ids.length)throw new Error('确认候选为空，无法执行原文对比；请调整检索策略或候选范围');
 const records=await store.analysisPatents(input.datasetId),documents=[];
 for(const id of ids){
  signal.throwIfAborted();const record=records.find(p=>p.id===id);if(!record)throw new Error('确认候选已从数据集中移除：'+id);
  const patent=await store.fullPatent(input.datasetId,record);
  const chunks=chunkPatent(patent,'novelty-'+taskId+'-candidates-'+candidates.revision,{maxChars:4000,maxClaimChars:4000});
  const batches=[];
  for(let start=0;start<chunks.length;start+=8){
   signal.throwIfAborted();const batch=chunks.slice(start,start+8);
   await store.event(run.id,'status',{phase:'Comparison',message:'正在对比 '+id+' 原文片段 '+(start+1)+'—'+(start+batch.length)+' / '+chunks.length});
   const model=modelConfig();
   const key=JSON.stringify(['novelty-comparison-v3',input.datasetId,taskId,features.revision,candidates.revision,id,start,model.model,model.base]);
   const saved=await store.comparisonCheckpoint(key) as {features:unknown;chunks:unknown;comparisons:Awaited<ReturnType<typeof compareProposalFeatures>>}|undefined;
   const reusable=saved&&isDeepStrictEqual(saved.features,source.features)&&isDeepStrictEqual(saved.chunks,batch);
   const comparisons=reusable?saved.comparisons:await compareProposalFeatures(source.features,batch,signal,write);
   if(!reusable){signal.throwIfAborted();await store.saveComparisonCheckpoint(key,{features:source.features,chunks:batch,comparisons});}
   else await store.event(run.id,'status',{phase:'Comparison',message:'已恢复 '+id+' 保存的对比批次 '+(start+1)});
   batches.push({startOrdinal:batch[0].ordinal,endOrdinal:batch.at(-1)!.ordinal,comparisons});
  }
  documents.push({patentId:id,title:patent.title,sourceUrl:patent.sourceUrl,documentVersion:chunks[0]?.documentVersion,chunkCount:chunks.length,sourceChunks:chunks,batches,status:chunks.length?'compared':'no_source'});
 }
 signal.throwIfAborted();
 return tasks.propose(taskId,'comparison',{featureRevision:features.revision,candidateRevision:candidates.revision,documents,notes:['每件专利单独对照全部可读取片段，批次结果不合并为法律结论。','未找到仅限本次保存的来源文本；缺失原文与未找到技术特征分别表示。','引文定位经程序核对，技术对应关系仍需用户核对确认。']},run.id);
}
