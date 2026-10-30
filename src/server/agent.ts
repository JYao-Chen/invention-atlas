import {auditReport} from './report-audit';
import {Annotation,StateGraph,START,END} from '@langchain/langgraph';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import type {Run,Patent,Params,AnalysisResult} from '@/lib/types';
import {dataset,analysisPatents,descriptionChars,saveRun,finishRun,event,run,runs,saveResult,conversations,setting} from './db';
import {chat,jsonResponse} from './model';
import {runTextWriter} from './run-text';
import {nameClusterTopics} from './cluster-topics';
import {modelConfig} from './config';
import {reportResult,reportDataset,reportScope} from './report-input';
import {readingReportContext,READING_REPORT_GUIDANCE} from './reading-report-guidance';
import {retrieveForReport} from './report-retrieval';
import {toolInformation} from './result-contract';
import {manualChapters,answerManual} from './manual-answer';
import {stepSchema,toolDefaults,recommendedTool,completeRecommendedStep,requiredParameters,examplePatent} from './planning';
import {TOOL_DEFS,executeTool,capability,scope as filterRecords} from './tools';
import {selectedRecords,searchIds,auditExecution,entityRulesSchema} from './research';
import {classificationStatistics,keepReviewOnSubject,researchReviewInstruction} from './research-intent';
import {prepareReport,REPORT_WRITING_GUIDANCE} from './report-preparation';
import {db} from './db';
import {JobStore} from './job-store';
import {submitAnalysis,submitReport} from './task-submission';
import {transaction} from './postgres';

export async function stopRun(id:string){
 await transaction(db,async client=>{
  const job=(await client.query('SELECT id,state FROM jobs WHERE run_id=$1 FOR UPDATE',[id])).rows[0];
  const r=await run(id);if(!r)throw new Error('运行不存在');if(r.status!=='running')return;
  if(job){await new JobStore(db).cancel(job.id);if(job.state==='running')return;}
  await client.query("UPDATE professional_tasks SET status='cancelled',updated_at=now() WHERE execution_run_id=$1 AND status IN('queued','running')",[id]);
  r.status='cancelled';r.error='任务已取消';await finishRun(r);
 });
}
export async function isPending(id:string){const job=await new JobStore(db).forRun(id);return job?.state==='queued'||job?.state==='running';}
const planSchema=z.object({scope:z.object({mode:z.enum(['dataset','search','previous']),counting:z.enum(['publication','family']).default('publication')}),steps:z.array(stepSchema).min(1).max(30)});
export function explicitTools(question:string){return TOOL_DEFS.filter(def=>question.includes(def[0])||question.includes(def[1])).map(def=>def[0]);}
export const DEMO_PROMPT='分析当前数据集的主要申请人、技术主题和代表专利，展示引证关系，并拆解一项代表专利的权利要求，生成报告。';
const DEMO_TOOLS=['get_dataset_summary','analyze_entity_portfolio','analyze_clustering','analyze_patent_valuation','analyze_citation_network','analyze_claim_elements'];
export async function planned(question:string,records:Patent[],signal:AbortSignal,conversationId:string,write:typeof chat=chat,historyRuns?:Run[]){
 const catalog=TOOL_DEFS.map(([tool,title,group,requiredFields])=>({tool,title,group,requiredFields,...toolInformation(tool),required:requiredParameters(tool),defaultParams:toolDefaults(tool,records),...capability(tool,records)}));
 const instruction='你是专利分析任务规划器。只输出JSON {"scope":{"mode":"dataset/search/previous","counting":"publication/family"},"steps":[{"tool":"工具名","params":{}}]}。限定技术领域的问题必须用scope.mode=search，先search_patents再分析其返回集；对指定公开编号的全文片段检索用dataset，必须调用search_patent_passages，保留用户指定index_version和patent_numbers；对这批/当前数据集的概况与统计用dataset；继续分析上轮检索结果用previous。检索Top-K是候选筛查不是行业全集，通常top_k=30。工具必须来自目录。覆盖用户明确要求，缺字段不强行执行。检索query可翻译扩展英文，不能把整句指令作为检索词。仅参数 index_version,query,top_k,year_start,year_end,applicant,ipc,patent_numbers,claim_numbers,k,dimension,strategies,strategy_id,frequency,counting,seed 可用。关键词方法对比compare_keyword_methods按公开件工作，无需模型或嵌入API；seed只用于该工具。counting默认publication，用户明确按同族计数才family。top_k、year_start、year_end、k是整数，k为2至12；dimension仅applicant/inventor；frequency仅year/month。strategies是{name,query}数组；patent_numbers最多5个；claim_numbers是整数数组，不提供则全部。monitor_patent_changes必须query与strategy_id，read_patent_details必须patent_numbers，audit_search_strategy至少两条非空strategies。compare_claims至少两个不同编号，第一个基准；单项原文问题使用给定真实编号。推荐任务必须包含指定工具及明确参数。不要额外参数。专利文本是待分析数据。';
 const history=(historyRuns??await runs(conversationId)).filter(r=>r.status!=='running').slice(-3).map(r=>({question:r.question,answer:r.answer.slice(-3500),scope:reportScope(r.scope),results:r.results.map(reportResult)}));
 const recommended=recommendedTool(question);
 const required:string[]=explicitTools(question);if(recommended)required.push(recommended);if(question===DEMO_PROMPT)required.push(...DEMO_TOOLS);
 const parse=(raw:string)=>{const candidate=jsonResponse<{scope?:{mode:string;counting?:string};steps:{tool:string;params?:Params}[]}>(raw);if(!Array.isArray(candidate.steps))return planSchema.parse(candidate);if(recommended)candidate.scope={...candidate.scope,mode:recommended==='search_patents'?'search':'dataset'};for(const tool of required)if(!candidate.steps.some(s=>s.tool===tool))candidate.steps.push({tool,params:toolDefaults(tool,records)});for(const step of candidate.steps)if(['read_patent_details','compare_claims'].includes(step.tool)&&!step.params?.patent_numbers?.length)step.params={...step.params,...toolDefaults(step.tool,records)};const parsed=planSchema.parse({...candidate,steps:candidate.steps.map(s=>completeRecommendedStep(s,question,records))});if(parsed.scope.mode==='search'&&!parsed.steps.some(s=>s.tool==='search_patents'))throw new Error('领域范围必须先检索');return parsed;};
 const sample=examplePatent(records);
 const context=JSON.stringify({question,history,record_count:records.length,recommended_task:recommended?{tool:recommended,params:toolDefaults(recommended,records)}:undefined,readable_example:sample?{id:sample.id,title:sample.title,claims:sample.claims.length,description_chars:descriptionChars(sample)}:undefined,tools:catalog});
 let raw=await write(instruction,context,{json:true,signal});let plan:z.infer<typeof planSchema>;
 try{plan=parse(raw);}catch(error){if(signal.aborted)throw error;raw=await write(instruction,context+'\n上次计划未通过参数校验，请只修正计划参数并返回完整计划。上次计划：'+raw+'\n校验错误：'+String(error),{json:true,signal});plan=parse(raw);}
 return classificationStatistics(question,plan);
}
export function sourceBundle(results:AnalysisResult[],records:Patent[]){
 const selected=results.flatMap(r=>r.rows.flatMap(row=>[row.patent,row.target_patent,row.representative,...(Array.isArray(row.representatives)?row.representatives:[])])).filter((id):id is string=>typeof id==='string');
 const allIds=[...new Set([...selected,...results.flatMap(r=>(r.rowSources||[]).flatMap(s=>s.representatives.map(p=>p.patent)))])],ids=allIds.slice(0,120);
 return {results:results.map(reportResult),sourcePresentation:{linkedSources:allIds.length,includedSources:ids.length,omittedSources:allIds.length-ids.length,note:'仅收集工具行及逐行成员关联的原文，不以scope/evidence全集中的任意编号充当代表文献。'},sources:records.filter(p=>ids.includes(p.id)).map(p=>({id:p.id,title:p.title,url:p.sourceUrl,applicants:p.applicants,publicationDate:p.publicationDate,ipc:p.ipc,cpc:p.cpc,abstract:p.abstract.slice(0,1000)}))};
}
export async function generateReport(r:Run,records:Patent[],signal:AbortSignal){
 const replacing=Boolean(r.answer);let revisedAnswer='';
 r.reportPreparation=prepareReport(r,records);(await saveRun(r));(await event(r.id,'report-preparation',{preparation:r.reportPreparation}));
 (await event(r.id,'status',{phase:'Evidence',message:'正在整理统计覆盖与代表专利证据'}));
 r.progress={tool:'report',unit:'正在整理统计覆盖与代表专利证据'};(await saveRun(r));(await event(r.id,'progress',r.progress));
 const additional=await retrieveForReport(r.question,r.results,signal);
 r.reportPreparation.additionalPages=additional.reads.length;r.reportPreparation.readNote=additional.note;(await saveRun(r));(await event(r.id,'report-preparation',{preparation:r.reportPreparation}));
 Object.assign(additional,{preparedAnalysis:r.reportPreparation,writingGuidance:REPORT_WRITING_GUIDANCE});
 Object.assign(additional,{patentReading:readingReportContext(r.results)});
 r.progress={tool:'report',unit:'分析准备完成，正在流式撰写报告'};(await saveRun(r));(await event(r.id,'progress',r.progress));
 (await event(r.id,'status',{phase:'Report',message:additional.reads.length?'已补读相关工具结果，正在生成报告':'正在生成报告'}));
 const bundle={...sourceBundle(r.results,records),additionalReads:additional,presentationInstruction:'使用contract理解字段、scope确认实际计算范围、rowSources定位逐行专利。关键词代表文献必须来自该词该年的rowSources，不能从数据集编号列表任意选取。图谱实际边和节点已经提供，不得把只有编号的外部节点写作已读取原文。按presentation.groups判断覆盖；omittedRows、omittedEdges、omittedPatentIds和shortenedTextPaths仅表示报告预览省略，禁止写成工具失败或原数据缺失。additionalReads是按问题补读的原始结果页，仍须核对分页。不得从预览推算完整总体统计；覆盖不全时引用图表。coverage是比例，百分数使用coveragePercent。以datasetSnapshot为准。',datasetSnapshot:reportDataset(r.datasetSnapshot||(await dataset(r.datasetId))),researchScope:r.scope,searchReviews:r.reviews,executionAudit:r.audit,reportCorrection:r.reportAudit&&!r.reportAudit.passed?{instruction:'逐条修正以下审计问题；删除无证据编号和数值，保留有依据的正文。',issues:r.reportAudit.issues}:undefined};(await saveRun(r));const textWriter=replacing?undefined:runTextWriter(r);
 await chat((r.results.some(result=>result.tool==='analyze_patent_reading')?READING_REPORT_GUIDANCE:'')+REPORT_WRITING_GUIDANCE+'你是中文专利分析助手。用清晰Markdown直接回答问题，包含主要发现、采用的方法与执行情况。直接陈述结果和依据，不添加通用免责声明、风险提示或人工复核提醒。只引用给定工具结果和来源元数据，数字来自工具结果，不自行推算企业类别数量或市场规模。不能从公开编号猜测年份、申请人或分类。样本集中度只能说明样本内分布，不能作垄断或实际市场竞争结论。为主题提供简短中文名称并保留原关键词。用公开编号链接引用代表专利；法律判断、技术继承因果、交易价格与市场份额均不能从这些工具推断。不可声称抽样语料覆盖整个行业。数学公式使用LaTeX：行内用$...$，独立公式用单独成行的$包围；不要将公式放进代码反引号。报告用自然语言与小表格，不输出JSON、不复述全部工具数据。在说明对应发现的段落后插入[[chart:工具结果id]]，页面会嵌入该真实结果的交互图表。只使用给定结果id，每个id最多一次，不构造新数据或外部图片。Google来源状态是第三方推定，Active不能表述为经官方确认有效；as_of是获取时点而非事件日期。reportedAmount若为知识产权组合交易，不得当作单项专利价格、不得按专利数量分摊。缺失或失败步骤必须说明。措辞按研究记录写，直接给出观察和依据。标题说明具体内容，不写宣传口号，不称自己为专家。避免“不是而是”的翻案句、空转总结、连续重复的句式和无依据的显著增长；保留真实数字、来源及限定词。不要用“首先其次最后”机械组织全文，不给每个小标题加序号。',JSON.stringify({question:r.question,dataset:(await dataset(r.datasetId)),...bundle}),{signal,onDelta:async text=>{if(textWriter)await textWriter.push(text);else revisedAnswer+=text;}});
 if(textWriter)await textWriter.flush();else{r.answer=revisedAnswer;await saveRun(r);}
}
export async function startRun(conversationId:string,datasetId:string,question:string,forced?:{tool:string;params:Params}[],toolOnly=false,maxModelCalls?:number){
 return submitAnalysis(db,{conversationId,datasetId,question,forced,toolOnly,maxModelCalls,model:modelConfig().model});
}
export type AgentDependencies={planned:typeof planned;review:typeof chat;executeTool:typeof executeTool;generateReport:typeof generateReport};
export async function executeRun(r:Run,forced:{tool:string;params:Params}[]|undefined,toolOnly:boolean,signal:AbortSignal,overrides:Partial<AgentDependencies>={}){
 const dependencies={planned,review:chat,executeTool,generateReport,...overrides};
 const {conversationId,datasetId,question}=r;
 const meta=await dataset(datasetId);if(!meta)throw new Error('数据集不存在或访问权限已撤销');
 const controller={signal};
 const manual=!forced&&!toolOnly?manualChapters(question):[];
 if(manual.length){await answerManual(r,manual,signal);return;}
 const records=(await analysisPatents(datasetId));(await event(r.id,'status',{phase:'Planner',message:'正在制定工具计划'}));
 const entityRules=entityRulesSchema.parse(JSON.parse((await setting('entities:'+datasetId))||'[]'));
 const prior=(await runs(conversationId)).filter(x=>x.id!==r.id&&x.scope&&x.status!=='running').at(-1);
 let progressWrites=Promise.resolve(),runWrites=Promise.resolve();
 const persistRun=()=>{const snapshot=structuredClone(r);runWrites=runWrites.then(()=>saveRun(snapshot));return runWrites;};
 const updateProgress=(progress:NonNullable<Run['progress']>)=>{r.progress=progress;progressWrites=progressWrites.then(async()=>{await event(r.id,'progress',progress);});return progressWrites;};
 const GraphState=Annotation.Root({steps:Annotation<{tool:string;params:Params}[]>({reducer:(_,next)=>next,default:()=>[]})});
 const orderResults=()=>{if(!toolOnly)r.results.sort((a,b)=>r.plan.findIndex(s=>s.tool===a.tool&&isDeepStrictEqual(s.params,a.params))-r.plan.findIndex(s=>s.tool===b.tool&&isDeepStrictEqual(s.params,b.params)));};
 const executeGroup=async(steps:{tool:string;params:Params}[],predicate:(tool:string)=>boolean,phase:string)=>{for(const step of steps.filter(s=>predicate(s.tool))){if(controller.signal.aborted)throw new Error('任务已停止');
  if(r.results.some(result=>result.tool===step.tool&&result.status!=='failed'&&isDeepStrictEqual(result.params,step.params)))continue;
  r.results=r.results.filter(result=>!(result.tool===step.tool&&result.status==='failed'&&isDeepStrictEqual(result.params,step.params)));
  (await event(r.id,'tool-start',{phase,tool:step.tool}));await updateProgress({tool:step.tool,unit:'正在读取数据与执行分析'});try{
  const working=phase==='Search'||!r.scope?records:selectedRecords(records,r.scope.patentIds);
  // Never substitute a global example into a restricted result set.
  if(['read_patent_details','analyze_claim_elements','analyze_tech_matrix','compare_claims'].includes(step.tool)&&r.scope?.mode!=='dataset'&&r.scope&&step.params.patent_numbers?.some(id=>!r.scope!.patentIds.includes(id))){if(step.params.patent_numbers.some(id=>question.includes(id)))throw new Error('明确指定的公开编号不在研究范围内，请调整检索或范围');step.params={...step.params,...toolDefaults(step.tool,working)};r.scope.notes.push(step.tool+' 示例编号改为当前研究范围内的真实记录：'+(step.params.patent_numbers||[]).join('、'));(await persistRun());(await event(r.id,'plan',{steps:r.plan}));}
  const result=await dependencies.executeTool(step.tool,step.params,meta,working,{monitorScope:r.scope?.mode==='search'?JSON.stringify({mode:'search',query:r.scope.selections[0]?.query}):r.scope?.mode==='previous'?'previous:'+r.scope.sourceRunId:'dataset',entityRules,nameTopics:nameClusterTopics,onWork:(done,total,unit)=>updateProgress({tool:step.tool,done,total,unit}),semantic:['search_patents','search_patent_passages'].includes(step.tool),signal:controller.signal,onProgress:(done,total)=>{progressWrites=progressWrites.then(async()=>{await event(r.id,'status',{phase,message:'技术效果全文抽取 '+done+'/'+total+' 条'});});},onCheckpoint:(done,total,reused)=>updateProgress({tool:step.tool,done,total,reused,unit:'全文分段抽取'})});await progressWrites;step.params=result.params;r.results.push(result);orderResults();(await saveResult(result));(await persistRun());(await event(r.id,'tool-result',{result}));}catch(e){if(controller.signal.aborted)throw e;const def=TOOL_DEFS.find(d=>d[0]===step.tool)!;const failed:AnalysisResult={id:randomUUID(),tool:step.tool,title:def[1],status:'failed',datasetId,params:step.params,summary:(e as Error).message,rows:[],warnings:[],method:'',evidence:[],createdAt:new Date().toISOString()};r.results.push(failed);orderResults();(await persistRun());(await event(r.id,'tool-result',{result:failed}));}}};
 const legacyStages=['Planner','Search','ResearchReview','Analysis','Claim','Comparison','Citation','Audit','Report'];
 if(!toolOnly&&!r.orchestration){
  // Legacy Audit preceded Report and cannot count as a completed report audit.
  const completed=legacyStages.slice(0,legacyStages.indexOf(r.executionStage||'')+1).filter(s=>s!=='Audit').map(s=>['Search','ResearchReview','Report'].includes(s)?s+':0':s);
  r.orchestration={version:1,completed,searchRounds:0,pendingSearch:false,reportRevisions:0};
  await persistRun();
 }
 type State={steps:Run['plan']};
 const active=new Set<Promise<unknown>>();
 const checkpoint=(stage:string,work:(state:State)=>Promise<{steps?:Run['plan']}>)=>(state:State)=>{
  const task=(async()=>{
   signal.throwIfAborted();
   const flow=r.orchestration,key=stage+(['Search','ResearchReview'].includes(stage)?':'+flow?.searchRounds:['Report','Audit'].includes(stage)?':'+flow?.reportRevisions:'');
   const completed=toolOnly?legacyStages.indexOf(r.executionStage||'')>=legacyStages.indexOf(stage):flow!.completed.includes(key);
   if(completed)return stage==='Planner'?{steps:r.plan}:{};
   await event(r.id,'stage-start',{stage,...(!toolOnly?{searchRound:flow!.searchRounds,reportRevision:flow!.reportRevisions}:{})});
   const output=await work(state);signal.throwIfAborted();
   if(!toolOnly)flow!.completed.push(key);
   r.executionStage=stage;await persistRun();await event(r.id,'stage-complete',{stage});return output;
  })();
  active.add(task);void task.finally(()=>active.delete(task)).catch(()=>{});return task;
 };
 const graph=new StateGraph(GraphState)
 .addNode('Planner',checkpoint('Planner',async()=>{const plan=forced?{scope:{mode:'dataset' as const,counting:'publication' as const},steps:forced}:await dependencies.planned(question,records,controller.signal,conversationId);const steps=plan.steps;r.plan=steps;r.scope={...plan.scope,patentIds:plan.scope.mode==='previous'?(prior?.scope?.patentIds||[]):records.map(p=>p.id),selections:[],notes:[],sourceRunId:plan.scope.mode==='previous'?prior?.id:undefined};const filters=({ipc,year_start,year_end,applicant}:Params)=>({ipc,year_start,year_end,applicant});const common=filters(steps[0].params);if(plan.scope.mode==='dataset'&&Object.values(common).some(v=>v!==undefined)&&steps.every(s=>JSON.stringify(filters(s.params))===JSON.stringify(common))){r.scope.patentIds=filterRecords(records,common).map(p=>p.id);r.scope.notes.push('对分类、年份及申请人条件匹配的全部记录分析；未使用检索Top-K筛选。');}if(plan.scope.mode==='previous'&&!prior?.scope)r.scope.notes.push('没有可恢复的上轮研究结果集，不回退到全库。');for(const step of steps)step.params.counting=step.params.counting||plan.scope.counting;(await persistRun());(await event(r.id,'plan',{steps}));(await event(r.id,'scope',{scope:r.scope}));return {steps};}))
 .addNode('Search',checkpoint('Search',async state=>{
  await executeGroup(state.steps,t=>t==='search_patents','Search');
  if(r.scope?.mode==='search'){
   const excluded=new Set((r.reviews||[]).flatMap(review=>(review.excluded||[]).map(e=>e.patent)));
   r.scope.patentIds=searchIds(r.results).filter(id=>!excluded.has(id));
   r.scope.selections=r.results.filter(x=>x.tool==='search_patents').map(x=>({query:x.params.query||'',patentIds:searchIds([x]),method:x.method}));
   r.scope.query=r.scope.selections.map(s=>s.query).join(' / ');
   const note='按检索 Top-K 候选并集分析。';if(!r.scope.notes.includes(note))r.scope.notes.push(note);
  }
  if(!toolOnly)r.orchestration!.pendingSearch=false;
  await persistRun();await event(r.id,'scope',{scope:r.scope});return {};
 }))
 .addNode('ResearchReview',checkpoint('ResearchReview',async state=>{
  if(forced||r.scope?.mode!=='search')return {};
  const flow=r.orchestration!,round=flow.searchRounds+1;
  await updateProgress({tool:'review',unit:'检查检索范围与任务覆盖'});
  const candidates=selectedRecords(records,r.scope.patentIds);let review;
  try{
   review=keepReviewOnSubject(question,z.object({decision:z.enum(['sufficient','expand','limited']),reason:z.string().min(1),query:z.string().max(2000).optional(),excluded:z.array(z.object({patent:z.string(),reason:z.string().min(1)})).default([])}).parse(jsonResponse(await dependencies.review(researchReviewInstruction,JSON.stringify({question,round,searches:r.scope.selections,candidates:candidates.map(p=>({id:p.id,title:p.title,abstract:p.abstract.slice(0,900)})),plan:state.steps}),{signal:controller.signal,json:true}))));
   if(review.excluded.some(e=>!candidates.some(p=>p.id===e.patent)))throw new Error('复核剔除编号不在候选集中');
   const excluded=new Set(review.excluded.map(e=>e.patent));r.scope.patentIds=r.scope.patentIds.filter(id=>!excluded.has(id));
  }catch(e){controller.signal.throwIfAborted();review={decision:'limited' as const,reason:'检索复核未完成：'+(e as Error).message};}
  r.reviews??=[];r.reviews.push({round,...review});
  const seen=new Set(r.scope.selections.map(s=>s.query)),canExpand=review.decision==='expand'&&Boolean(review.query?.trim())&&!seen.has(review.query!)&&flow.searchRounds<2;
  if(canExpand){
   const original=state.steps.find(s=>s.tool==='search_patents'),extra={tool:'search_patents',params:{...original?.params,query:review.query!.trim(),top_k:original?.params.top_k||30}};
   r.plan=[...state.steps,extra];flow.searchRounds++;flow.pendingSearch=true;await event(r.id,'plan',{steps:r.plan});
  }else if(review.decision==='expand')r.scope.notes.push(flow.searchRounds>=2?'已到补检索轮数上限；保留候选集，不宣称检索完整。':'补检索词为空或已检索；保留范围限制。');
  await persistRun();await event(r.id,'research-review',{review:r.reviews.at(-1),searchRounds:flow.searchRounds,next:canExpand?'Search':'Analysis',limit:2});await event(r.id,'scope',{scope:r.scope});return {steps:r.plan};
 }))
 .addNode('Analysis',checkpoint('Analysis',async state=>{await executeGroup(state.steps,t=>!['search_patents','analyze_claim_elements','compare_claims','analyze_citation_network'].includes(t),'Analysis');return {};}))
 .addNode('Claim',checkpoint('Claim',async state=>{for(const step of state.steps.filter(t=>t.tool==='analyze_claim_elements'&&!t.params.patent_numbers?.length)){const representative=r.results.find(result=>result.tool==='analyze_patent_valuation'&&result.status==='completed')?.rows[0]?.patent;if(typeof representative==='string'){step.params={...step.params,patent_numbers:[representative]};r.plan=state.steps;(await persistRun());(await event(r.id,'plan',{steps:state.steps}));}}await executeGroup(state.steps,t=>t==='analyze_claim_elements','Claim');return {};}))
 .addNode('Comparison',checkpoint('Comparison',async state=>{await executeGroup(state.steps,t=>t==='compare_claims','Comparison');return {};}))
 .addNode('Citation',checkpoint('Citation',async state=>{await executeGroup(state.steps,t=>t==='analyze_citation_network','Citation');return {};}))
 .addNode('Report',checkpoint('Report',async()=>{
  if(toolOnly){r.answer='';return {};}
  const replacing=Boolean(r.answer);
  await updateProgress({tool:'report',unit:r.orchestration!.reportRevisions?'正在整理最终报告':'模型正在生成报告；文字会流式显示'});
  await event(r.id,'status',{phase:'Report',message:'正在流式生成报告'});await dependencies.generateReport(r,records,controller.signal);if(replacing)await event(r.id,'text-snapshot',{text:r.answer});return {};
 }))
 .addNode('Audit',checkpoint('Audit',async state=>{
  if(toolOnly){r.audit=auditExecution(state.steps,r.results);for(const result of r.results)await saveResult(result);await persistRun();await event(r.id,'audit',{audit:r.audit});return {};}
  await event(r.id,'status',{phase:'Audit',message:'正在逐条核对报告中的公开编号与数值'});
  const flow=r.orchestration!,attempt=flow.reportRevisions+1;
  // The audit may have been saved before a worker lost its lease. Reuse it for
  // this completed report instead of auditing our own retained-issues appendix.
  if(r.reportAudit?.attempt!==attempt){const issues=auditReport(r.answer,r.results,r.datasetSnapshot||await dataset(r.datasetId));r.reportAudit={attempt,passed:issues.length===0,issues};}
  const issues=r.reportAudit.issues;
  const retry=issues.length>0&&flow.reportRevisions<1;
  // Revision counters are advanced in the routing node below, after this audit
  // checkpoint is durable, so a resumed graph cannot skip the correction.
  await persistRun();await event(r.id,'report-audit',{audit:r.reportAudit,next:retry?'Report':'End',revisionLimit:1});

  return {};
 }))
;
 graph.addEdge(START,'Planner').addEdge('Planner','Search').addEdge('Search','ResearchReview');
 const compiled=toolOnly?graph.addEdge('ResearchReview','Analysis').addEdge('Analysis','Claim').addEdge('Claim','Comparison').addEdge('Comparison','Citation').addEdge('Citation','Audit').addEdge('Audit','Report').addEdge('Report',END).compile():graph
 .addNode('ExecutionAudit',async state=>{
  signal.throwIfAborted();r.audit=auditExecution(state.steps,r.results);for(const result of r.results)await saveResult(result);await persistRun();await event(r.id,'audit',{audit:r.audit});return {};
 })
 .addNode('ReviseReport',async()=>{
  signal.throwIfAborted();r.orchestration!.reportRevisions=1;await persistRun();await event(r.id,'report-revision',{revision:1,reason:r.reportAudit?.issues});return {};
 })
 .addConditionalEdges('ResearchReview',()=>r.orchestration!.pendingSearch?'Search':'Analysis',['Search','Analysis'])
   .addEdge('Analysis','Claim').addEdge('Analysis','Comparison').addEdge('Analysis','Citation')
   .addEdge(['Claim','Comparison','Citation'],'ExecutionAudit').addEdge('ExecutionAudit','Report').addEdge('Report','Audit')
   .addConditionalEdges('Audit',()=>r.reportAudit&&!r.reportAudit.passed&&r.orchestration!.reportRevisions<1?'ReviseReport':END,['ReviseReport',END])
   .addEdge('ReviseReport','Report').compile();
 try{await compiled.invoke({},{signal:controller.signal,recursionLimit:40});}
 finally{await Promise.allSettled([...active]);await progressWrites;await runWrites;}
}
export async function retryReport(id:string){return submitReport(db,id);}
