import type {Pool} from 'pg';
import type {Run,AnalysisResult} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {chat} from './model';
import {runTextWriter} from './run-text';
import {validateReportCharts} from './professional-report';
import {noveltyReportEvidence,partitionNoveltyEvidence} from './novelty-report-input';
import {modelConfig} from './config';
import {isDeepStrictEqual} from 'node:util';
import {reportDataset} from './report-input';
import {disclosureOrigin} from './disclosure-origin';
import {materialOrigin} from './material-origin';
import {numberedNoveltyCitations,noveltyCitationStream,noveltyCitationWritingInput} from './novelty-citations';

export async function writeNoveltyReport(pool:Pool,taskId:string,run:Run,signal:AbortSignal,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='novelty-search'||task.current_stage!=='report'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在查新报告阶段');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const features=confirmed('features'),strategies=confirmed('strategies'),candidates=confirmed('retrieval'),comparison=confirmed('comparison');
 if(!features||!strategies||!candidates||!comparison)throw new Error('缺少确认的查新阶段产物');
 if(strategies.data.featureRevision!==features.revision||candidates.data.strategyRevision!==strategies.revision||candidates.data.featureRevision!==features.revision||comparison.data.featureRevision!==features.revision||comparison.data.candidateRevision!==candidates.revision)throw new Error('查新报告依据版本不一致');
 const results:AnalysisResult[]=[];
 for(const strategy of candidates.data.strategies){const result=await store.savedResult(strategy.resultId);if(!result||result.datasetId!==run.datasetId)throw new Error('查新检索结果不存在');results.push(result);}
 run.results=results;run.scope={mode:'search',counting:'publication',patentIds:candidates.data.patentIds,selections:[],notes:['已确认多策略候选，不是全球现有技术全集。']};run.answer='';await store.saveRun(run);
 await store.event(run.id,'text-reset',{});await store.event(run.id,'status',{phase:'Report',message:'正在依据确认的特征对比底稿流式生成查新报告'});
 const revisions={features:features.revision,strategies:strategies.revision,candidates:candidates.revision,comparison:comparison.revision};
 const dataset=await store.dataset(run.datasetId);if(!dataset)throw new Error('报告数据集不存在');
 const numbered=numberedNoveltyCitations(comparison.data);
const context={input:task.input,dataset:reportDataset(dataset),revisions,features:features.data,strategies:strategies.data,candidates:candidates.data,comparison:noveltyReportEvidence(noveltyCitationWritingInput(numbered.comparison)),interpretationRules:['总结只能描述本次选定文献与已确认批次，禁止宣称行业技术密集、特征普遍存在、大多数专利都会提及或无需继续检索。','不同批次有supported、partial、not_found时分别列明，不用高度支持等总体标签替代；建议必须标明待检索方向，不视为已经发现的证据。','Top-K数量是输出上限，不能推断技术丰富程度、专利密度或检索完整性。','用户确认候选只表示选择用于对比，不表示已经证明高相关性。','公开年份只使用publicationDate字段，不混称授权日或优先权日。','保持方案特征原有范围；发送摘要不等于仅发送摘要，不补充轻量、快速等未提供限制。','一般区块链知识不能代替专利原文公开；传播区块不能未经证据就认定必然包含摘要发送步骤。']};
 const writer=runTextWriter(run,store.event.bind(store),store.saveRun.bind(store));
 const proposalOrigin=disclosureOrigin(task.input);
 const material=materialOrigin(task.input);
 if(material)await writer.push(material.markdown);
 if(proposalOrigin)await writer.push(proposalOrigin.markdown);
 const parts=partitionNoveltyEvidence(context.comparison);
 for(let part=0;part<parts.length;part++){
 signal.throwIfAborted();
 await store.event(run.id,'status',{phase:'Report',message:'正在撰写查新对比底稿 '+(part+1)+' / '+parts.length});
 if(part)await writer.push('\n\n');
 const model=modelConfig(),key=JSON.stringify(['novelty-report-v1',run.datasetId,taskId,run.id,part,model.model,model.base]);
 const partContext=JSON.parse(JSON.stringify({...context,comparison:parts[part],reportPart:{number:part+1,total:parts.length,instruction:part===0?'仅首段介绍方案和策略；本段逐文献对照。':'延续正文，只写本段文献对照与局部限制，不重复开篇，不补造其他段结论。'}}));
 const saved=await store.comparisonCheckpoint(key) as {context:unknown;answer:string}|undefined;
 if(saved&&typeof saved.answer==='string'&&saved.answer.trim()&&isDeepStrictEqual(saved.context,partContext)){
  validateReportCharts(saved.answer,[]);await writer.push(saved.answer);
  await store.event(run.id,'status',{phase:'Report',message:'已恢复完整报告段落 '+(part+1)+' / '+parts.length});continue;
 }
 await writer.flush();const begin=run.answer.length;
 const citationStream=noveltyCitationStream(numbered.citations,text=>writer.push(text));
 await write('撰写中文技术方案查新辅助报告，不是法律意见。引用证据必须使用 [[evidence:E编号]]，编号来自evidence.citationId；程序插入原文，禁止自行写引用文本或Markdown引用块。不在编号外改写引文。原文由程序持有，不要求也不允许模型补写；只组织确认的解释和状态，不重新推断supported或not_found，不合并不同批次为整体判定。严格遵守interpretationRules；数据来源与覆盖仅使用dataset声明，不称全球数据库或完整现有技术。不要以返回Top-K满额说明领域丰富或重叠密集；不称选定候选已经高相关；不为方案增加仅、快速、轻量等限制。依据已确认方案、策略、候选和逐特征证据矩阵组织报告：方案与检索边界、检索底稿、逐文献特征对应、尚未找到或仅部分对应的特征及后续检索建议。不得把各批次supported状态组合为整体新颖性结论，不得把不同专利拼成一件专利的完整公开。not_found仅限提供原文片段，no_source是缺少可读原文。引用具体公开编号、字段、权利要求号及原文逐字引文；引用只能来自comparison.documents中保存的证据，不从候选编号列表补造代表证据。布尔总命中和语义Top-K分别说明，不称全球检索完备。数据集年份筛选不是优先权日现有技术判定，地域目标不是法律数据覆盖。描述样本边界，不判断方案必然新颖、创造或可以自由实施。公式使用LaTeX分隔符，不输出JSON，不输出图表占位符，因为此底稿以逐文献对比为主。',JSON.stringify(partContext),{signal,maxTokens:12000,onDelta:text=>citationStream.push(text)});
 await citationStream.finish();await writer.flush();signal.throwIfAborted();const answer=run.answer.slice(begin);
 if(!answer.trim())throw new Error('模型未返回当前报告段落');validateReportCharts(answer,[]);
 await store.saveComparisonCheckpoint(key,{context:partContext,answer});
 }
 await writer.flush();signal.throwIfAborted();validateReportCharts(run.answer,[]);
 const artifact=await tasks.propose(taskId,'report',{answer:run.answer,resultIds:results.map(result=>result.id),sourceRevisions:revisions,proposalOrigin:proposalOrigin?{type:proposalOrigin.type,id:proposalOrigin.id,revision:proposalOrigin.revision,title:proposalOrigin.title}:undefined,runId:run.id},run.id);
 await tasks.confirm(taskId,'report',artifact.revision);return artifact;
}
