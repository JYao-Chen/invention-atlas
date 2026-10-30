import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run,AnalysisResult} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {confirmLayout} from './layout-confirmation';
import {chat} from './model';
import {reportResult,reportDataset} from './report-input';
import {runTextWriter} from './run-text';
import {validateReportCharts} from './professional-report';
import {noveltyCitationStream,type NoveltyCitation} from './novelty-citations';

export async function writeLayoutReport(pool:Pool,taskId:string,run:Run,signal:AbortSignal,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='patent-layout'||task.current_stage!=='report'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在布局报告阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
 const approved=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const scope=approved('scope'),candidate=approved('retrieval'),extraction=approved('extraction'),labels=approved('labels'),directions=approved('directions');
 if(!scope||!candidate||!extraction||!labels||!directions)throw new Error('缺少确认的布局阶段');
 if(candidate.data.scopeRevision!==scope.revision||extraction.data.candidateRevision!==candidate.revision||labels.data.extractionRevision!==extraction.revision||directions.data.labelRevision!==labels.revision||directions.data.scopeRevision!==scope.revision)throw new Error('布局报告依据版本不一致');
 const source=await store.savedResult(extraction.data.resultId);if(!source||source.datasetId!==input.datasetId)throw new Error('布局原始证据不存在');
 const confirmed=confirmLayout(source,labels.data.confirmation);if(!isDeepStrictEqual(confirmed,labels.data.confirmed))throw new Error('确认标签与来源矩阵不一致');
 let matrix=run.results.find(r=>r.tool==='analyze_tech_matrix'&&r.title==='用户确认的布局矩阵');
 if(!matrix){matrix={...structuredClone(source),id:randomUUID(),title:'用户确认的布局矩阵',layoutMatrix:confirmed.matrix,summary:`用户保留 ${confirmed.includedEvidenceCount}/${confirmed.sourceEvidenceCount} 条证据，排除 ${confirmed.excludedEvidenceCount} 条；计数按确认标签归并后的公开编号。`,warnings:[...source.warnings,'矩阵使用用户确认标签；数据表保留原始完整证据行，包含用户排除的行，以维持来源索引，不可将表行数当作保留关系数。'],method:confirmed.interpretation};await store.saveResult(matrix);}
 const results:AnalysisResult[]=[matrix];
 for(const search of directions.data.searches){const result=await store.savedResult(search.resultId);if(!result||result.datasetId!==input.datasetId)throw new Error('布局补检索结果不存在');if(!results.some(r=>r.id===result.id))results.push(result);}
 const indices=[...new Set(confirmed.matrix.cells.flatMap(cell=>cell.evidenceRows))];
 const citations:NoveltyCitation[]=indices.map((index,i)=>{const row=source.rows[index],start=z.number().int().nonnegative().parse(row.section_offset),quote=z.string().min(1).parse(row.quote);return {citationId:'E'+(i+1),patentId:String(row.patent),documentVersion:'tool-result:'+source.id,section:String(row.section),start,end:start+quote.length,quote};});
 const reference=new Map(indices.map((index,i)=>[index,'E'+(i+1)]));
 run.results=results;run.scope={mode:'search',counting:'publication',patentIds:candidate.data.patentIds,selections:[],notes:['矩阵抽取限于候选；补检索范围见确认研究范围，均非行业全集。']};run.datasetSnapshot=scope.data.datasetSnapshot;run.answer='';await store.saveRun(run);
 await store.event(run.id,'text-reset',{});await store.event(run.id,'status',{phase:'Report',message:'已确认矩阵与补检索，正在流式生成布局研究报告'});
 const revisions={scope:scope.revision,candidates:candidate.revision,extraction:extraction.revision,labels:labels.revision,directions:directions.revision};
 const context={input,dataset:reportDataset(run.datasetSnapshot),revisions,confirmedMatrix:confirmed,matrixResultId:matrix.id,results:results.map(reportResult),directions:{...directions.data.suggestions,directions:directions.data.suggestions.directions.map((d:{evidenceRows:number[];evidence:unknown[]})=>({...d,evidence:undefined,citationIds:d.evidenceRows.map(index=>reference.get(index))}))},searches:directions.data.searches,citations:citations.map(({quote,...citation})=>({...citation,quoteStored:true})),rules:['仅讨论用户确认纳入的directions；空方向表示不写候选方向，不得自行补造或重新纳入被排除建议。','使用用户确认的标签及原始引文。','原始完整数据表包含排除证据，分析计数以确认矩阵为准。','按保存证据及检索结果描述各候选方向。','段落检索不可用或失败须保留原因；显示实际返回数量。']};
 const writer=runTextWriter(run,store.event.bind(store),store.saveRun.bind(store)),stream=noveltyCitationStream(citations,text=>writer.push(text));
 await write('直接陈述结果、方法和依据，不写通用免责声明、复核提醒或风险提示。撰写中文专利布局研究报告，依据给定研发目标、范围、确认矩阵、候选方向与真实补检索结果组织正文。逐字引文只用[[evidence:E编号]]，由程序插入原文，禁止自行写引文或Markdown引用块。完整确认矩阵已提供，工具rows预览的省略不等于数据缺失；不要用未读证据推断技术不存在。区分原文声明、用户合并标签及待验证重组假设；不得宣称发现专利空白、具有新颖性或可自由实施。具体检索数量、状态以searches及工具结果为准。讨论各方向证据与尚需实验/检索验证的问题；严格遵守rules。使用[[chart:已提供结果id]]在讨论之后插入矩阵/检索结果，每项一次。公式用LaTeX分隔符，不重新规划工具，不输出JSON。',JSON.stringify(context),{signal,onDelta:text=>stream.push(text)});
 await stream.finish();await writer.flush();signal.throwIfAborted();validateReportCharts(run.answer,results);
 const artifact=await tasks.propose(taskId,'report',{answer:run.answer,resultIds:results.map(r=>r.id),sourceRevisions:revisions,runId:run.id},run.id);await tasks.confirm(taskId,'report',artifact.revision);return artifact;
}
