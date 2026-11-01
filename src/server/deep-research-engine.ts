import path from 'node:path';
import {researchWordCount} from '../lib/research-words';
import {researchPatentMentions} from './research-editorial';
import {researchToolPolicy,requireResearchSelection} from './research-tool-policy';
import {RESEARCH_SKILLS} from './research-skills';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {tool} from '@langchain/core/tools';
import {ToolMessage,HumanMessage} from '@langchain/core/messages';
import type {BaseLanguageModel} from '@langchain/core/language_models/base';
import {ChatOpenAI} from '@langchain/openai';
import {createMiddleware} from 'langchain';
import {createDeepAgent,registerHarnessProfile,CompositeBackend,StateBackend,FilesystemBackend,pinnedSkillsValue} from 'deepagents';
import {Command,interrupt,isGraphBubbleUp,StateSchema} from '@langchain/langgraph';
import type {Run,AnalysisResult} from '../lib/types';
import {DeepResearchStore,assembleResearchReport,outlineSchema,briefSchema,ResearchInputError} from './deep-research-store';
import {ResearchCheckpointer} from './research-checkpointer';
import {PostgresStore} from './postgres-store';
import {executeTool,TOOL_DEFS} from './tools';
import {ExternalReferenceReader} from './external/store';
import {nameClusterTopics} from './cluster-topics';
import {resultPatentNumbers} from './report-conclusions';
import {researchResultPreview,researchResultPage} from './research-results';
import {REPORT_WRITING_GUIDANCE} from './report-preparation';
import {toolInformation} from './result-contract';
import {transaction} from './postgres';
import {modelConfig} from './config';
import {ModelBudget,ModelBudgetExceeded} from './model-budget';
import {ModelUsage,providerTokens} from './model-usage';

class ResearchPaused extends Error{constructor(){super('研究已暂停');}}
function researchErrorCause(error:unknown):unknown{while(error instanceof Error&&error.cause instanceof Error)error=error.cause;return error;}

const instructions=`你是 Invention Atlas 的深度研究助手，负责独立完成可供阅读的中文专业报告。
工作方式：先了解数据和用户目标，自主规划研究问题与章节；调用分析工具、检索并阅读原文，把发现与证据保存下来；逐章写作，根据新发现调整研究和提纲；对照各章发现再做综合和摘要，最后保存整篇报告。研究路径由问题和证据决定。根据当前阶段读取 /skills/ 中对应 SKILL.md：research-planning、research-iteration、patent-landscape、patent-close-reading、evidence-writing、report-revision、chinese-style。先理解用户意图，在 propose_outline 的 brief 中展示研究用途、范围、方法和需要用户回答的问题。需求讨论阶段每次调整后再次等待确认；确认前不开始系统性分析或写作。确认后在研究范围内自行补证、调整论证路径和修订章节，不重复等待用户确认。
必须先用 propose_outline 保存提纲，再用 confirm_outline 确认；确认前只能进行了解数据所需的研究。保存提纲后再单独调用确认工具；确认后再开始写作；完成各章保存后单独调用 finish_report。用户确认的提纲可以补充和调整，保留已写章节的编号。章节按论证需要划分，围绕一个有意义的研究问题展开；篇幅由证据、比较与解释决定，相近问题合并。摘要与综合章节在主体分析完成后撰写，排列顺序可在提纲中提前。
研究不是先跑完工具再统一扩写的单向阶段。围绕当前研究问题反复执行：提出待判断的主张，选择能支持或反驳它的证据，读取结果与原文，分析差异和其他解释，形成阶段判断并写入章节。写作中发现新问题、相反证据或跨章冲突时，立即回到检索、计算或原文阅读，随后修订受影响章节；已写章节可以在后续研究中多次改写。下一步由尚未回答的问题决定，不按工具目录轮流运行，也不为展示流程重复调用工具。
在形成有意义的阶段发现、改变研究方向或发现需要补证的问题时，用 record_research 保存可供回溯的研究记录：问题、证据支持的发现、尚未解决的缺口、下一步及涉及章节。记录的是研究判断与依据，不是隐藏思维过程；不要求为每次工具调用写一条记录。用工作区笔记展开材料，在 record_research 中保留后续决策需要的信息。没有缺口时可记录空gaps，但完成前应回看历次记录，说明此前问题如何被证据解决或通过收窄结论处理。
使用 research_state 查看最新反馈、提纲及章节摘要，用 read_chapter 阅读正文，避免反复将整份报告放入对话。用工作区文件记录研究笔记和待解决问题。
run_analysis 可调用系统分析工具；read_result 分页读取完整结果。统计数字必须来自工具结果。具体专利的标题、公开日期、技术内容与版本关系必须核查已读取的原文或元数据，不能从编号猜月份、编造标题或假定两个编号属于同族。统计图仅支持实际返回字段，不能用年度图为某专利的技术描述充当原文来源。不写未经计算的“相对结构不变”、从静态共现推断转移或没有证据的因果解释。read_patent 提供已保存的原文和精确位置，可继续分页阅读。read_patent_papers 读取专利关联论文元数据与来源，适合研究科学知识来源。
按目标篇幅安排研究深度，选择能够回答研究问题的分析与原文。需要阅读几段原文时直接使用 read_patent；analyze_patent_reading 会对整篇全文分段调用模型，仅在需要系统整理全文笔记时使用。预算接近上限时，优先完成已有研究的章节与综合。对当前问题取证并解释后，及时将已有依据的判断写入章节，再按缺口继续研究。跨章节对照统计口径、年份、主体和技术主题，必要时补充工具调用、改写已有章节。篇幅靠有证据的新分析、案例与比较展开，不得重复表述、堆砌通识背景或无关内容凑字数。用 write_chapter 保存完整正文和该章发现；修订时重新提交该章全文。
直接介绍数据名称、记录数、年份、计数口径及选择方式。影响结论的缺失情况、方法条件、样本范围与不确定性，放在对应判断附近说明具体影响；无需等待用户追问。删除通用免责声明、重复提醒、自动审计待复核清单、提示词和写作过程。正文以有依据的结论、比较、解释和实例回答研究问题；证据不足时补充研究或收窄判断，不编造数值、专利或引文。
引用已登记证据用 [[source:证据编号]]，图表用 [[chart:分析结果编号]]，引文保留原文。引用须列入章节 evidenceIds。不同章节引用同一数据时保持口径一致。正文只写章节内容，章节标题由系统组装。
达到研究目标、所有章节完成并检查跨章节一致性后调用 finish_report；该工具会直接将报告保存到报告库。`;

export async function executeDeepResearch(pool:Pool,run:Run,signal:AbortSignal,overrides:{model?:BaseLanguageModel;execute?:typeof executeTool}={}){
 const tasks=new DeepResearchStore(pool),store=new PostgresStore(pool),task=await tasks.get(run.id);if(!task)throw new ResearchInputError('深度报告不存在');
 if(task.status==='completed')return;
 const meta=run.datasetSnapshot;if(!meta)throw new ResearchInputError('研究数据快照不存在');
 const records=await store.analysisPatents(run.datasetId),checkpointer=new ResearchCheckpointer(pool,run.id),config={configurable:{thread_id:run.id},signal,recursionLimit:Math.max(128,((await new ModelBudget(pool).read(run.id))?.max_calls??task.input.maxModelCalls)*16)};
 const saved=await checkpointer.getTuple(config);
 await tasks.status(run.id,'running');
 const checkPause=async()=>{signal.throwIfAborted();if((await tasks.get(run.id))?.status==='paused')throw new ResearchPaused();};
 const progress=async(message:string)=>{await checkPause();run.progress={tool:'research',unit:message};await store.saveRun(run);await store.event(run.id,'status',{phase:'Research',message});};
 const requireConfirmed=async()=>{await checkPause();const t=await tasks.get(run.id);if(!t?.outline.length||task.input.mode==='confirm_outline'&&!t.outline_confirmed)throw new ResearchInputError('请先保存并确认提纲');return t;};
 const tools=[
  tool(async()=>{
   const t=(await tasks.get(run.id))!;return {goal:t.input.goal,targetWords:t.input.targetWords,title:t.title,outline:t.outline,confirmed:t.outline_confirmed,feedback:t.feedback,researchCycles:t.cycles,
    budget:await new ModelBudget(pool).read(run.id),chapters:t.chapters?.map(({id,revision,findings,body})=>({id,revision,findings,words:researchWordCount(body)})),results:run.results.filter(r=>r.status==='completed').map(r=>({id:r.id,tool:r.tool,title:r.title,chartReference:'[[chart:'+r.id+']]',sourceReference:'[[source:'+r.id+']]'})),skills:RESEARCH_SKILLS,brief:t.brief,planningHistory:t.planning_history,evidence:t.evidence?.map(e=>({id:e.id,title:e.payload.title,kind:e.payload.kind,patent:e.payload.patent,field:e.payload.field,offset:e.payload.offset,chars:e.payload.quote?.length,question:e.payload.question,reference:'[[source:'+e.id+']]'})),dataset:meta,
    tools:TOOL_DEFS.filter(d=>d[0]!=='monitor_patent_changes').map(d=>({name:d[0],title:d[1],...toolInformation(d[0]),...researchToolPolicy(d[0])}))};
  },{name:'research_state',description:'读取研究目标、最新用户要求、提纲、已写章节发现、证据目录与系统分析工具说明。',schema:z.object({})}),
  tool(async({title,outline,brief})=>{await tasks.outline(run.id,title,outline,brief);await progress('提纲已更新：'+title);return {saved:true,outline};},{name:'propose_outline',description:'保存或调整报告提纲。以研究问题组织章节，给出字数，保留已写章节编号。',schema:z.object({title:z.string().min(1).max(200),outline:outlineSchema,brief:briefSchema})}),
  tool(async()=>{
   const t=await tasks.get(run.id);if(!t?.outline.length)throw new ResearchInputError('请先保存提纲');
   if(task.input.mode==='confirm_outline'){
    if(!t.outline_confirmed)await tasks.status(run.id,'awaiting_outline');
    const decision=interrupt({kind:'outline',message:'请讨论或确认研究方案后继续'}) as {action?:string}|boolean;
    if(typeof decision==='object'&&decision.action==='revise'){return {confirmed:false,action:'请结合最新用户反馈重新理解目标，更新brief与提纲，再次调用confirm_outline等待确认',feedback:(await tasks.get(run.id))!.feedback};}
   }
   await tasks.status(run.id,'running');return {confirmed:true,outline:(await tasks.get(run.id))!.outline};
  },{name:'confirm_outline',description:'提纲准备好后调用。默认等待用户确认；全自动模式直接继续。',schema:z.object({})}),
  tool(async({name,params,question})=>{
   if(!TOOL_DEFS.some(d=>d[0]===name)||name==='monitor_patent_changes')throw new ResearchInputError('请选择研究工具目录中的分析工具');
   requireResearchSelection(name,params,records);
   await progress('正在研究：'+question);
   const entityRules=JSON.parse((await store.setting('entities:'+run.datasetId))||'[]');
   let progressWrites=Promise.resolve(),lastProgressAt=0;
   const updateWork=(done:number,total:number,unit:string,reused?:number)=>{const now=Date.now();if(done!==total&&now-lastProgressAt<500)return;lastProgressAt=now;progressWrites=progressWrites.then(async()=>{await checkPause();run.progress={tool:name,done,total,unit,...(reused===undefined?{}:{reused})};await store.saveRun(run);await store.event(run.id,'progress',run.progress);});};
   let result:AnalysisResult;
   try{
    result=await (overrides.execute||executeTool)(name,params,meta,records,{entityRules,nameTopics:nameClusterTopics,semantic:['search_patents','search_patent_passages'].includes(name),signal,
     onWork:updateWork,onProgress:(done,total)=>updateWork(done,total,'全文专利抽取'),onCheckpoint:(done,total,reused)=>updateWork(done,total,'全文分段抽取',reused),
    }).finally(()=>progressWrites);
   }catch(error){
    const cause=researchErrorCause(error);if(signal.aborted||cause instanceof ResearchPaused||cause instanceof ModelBudgetExceeded)throw error;
    result={id:randomUUID(),tool:name,title:TOOL_DEFS.find(d=>d[0]===name)![1],datasetId:meta.id,status:'failed',params:{},summary:(error as Error).message,rows:[],method:'',warnings:[],evidence:[],createdAt:new Date().toISOString()};
   }
   signal.throwIfAborted();
   await transaction(pool,async()=>{run.results.push(result);await store.saveResult(result);await store.saveRun(run);if(result.status==='completed')await tasks.evidence(run.id,{kind:'result',title:result.title,resultId:result.id,question},result.id);});
   return {...researchResultPreview(result),researchQuestion:question,next:'先解释该结果能支持什么、还缺什么，再决定继续读结果、查原文、补充分析或写入章节。'};
  },{name:'run_analysis',description:'先明确当前要回答的question，再查research_state中工具的execution/selection/reading约定。统计可覆盖全库；全文分段模型工具必须显式提供patent_numbers，每批最多5件，不用整库全文抽取代替全库统计。保存完整结果，返回20行预览；详细行用read_result按问题分页，图表引用结果编号。',schema:z.object({question:z.string().trim().min(3).max(2000),name:z.string(),params:z.record(z.unknown())})}),
  tool(async({resultId,...input})=>{const result=run.results.find(r=>r.id===resultId);if(!result)throw new ResearchInputError('该分析结果不属于当前研究');return researchResultPage(result,input);},{name:'read_result',description:'按结果编号和问题分页读取完整数据。用patent精确核查某公开编号所属主题或统计行；读取返回的method及原始行关联，不根据标题猜测归属。',schema:z.object({resultId:z.string(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(50),word:z.string().optional(),patent:z.string().optional(),year:z.string().optional(),section:z.string().optional()})}),
  tool(async({evidenceId})=>{const evidence=(await tasks.get(run.id))!.evidence?.find(e=>e.id===evidenceId);if(!evidence)throw new ResearchInputError('该证据不属于当前研究');return {evidenceId:evidence.id,sourceReference:'[[source:'+evidence.id+']]',...evidence.payload};},{name:'read_evidence',description:'复用当前研究已登记的原文片段与位置。先按research_state证据目录的问题、字段与偏移选编号，恢复已读证据；不重复登记，不额外调用模型。',schema:z.object({evidenceId:z.string().min(1)})}),
  tool(async({patentId,field,offset,length,question,find})=>{
   const record=records.find(p=>p.id===patentId);if(!record)throw new ResearchInputError('专利不在当前数据集');
   await progress('正在阅读'+({abstract:'摘要',claims:'权利要求',description:'说明书'}[field])+'：'+patentId);
   const patent=await store.fullPatent(run.datasetId,record),text=field==='claims'?patent.claims.map(c=>c.number+'. '+c.text).join('\n\n'):patent[field];
   if(find){const position=text.toLowerCase().indexOf(find.toLowerCase(),offset);if(position<0)return {patentId,field,question,find,found:false,totalChars:text.length,nextOffset:null};offset=position;}
   const quote=text.slice(offset,offset+length);if(!quote)throw new ResearchInputError('该原文位置没有内容，请选择其他字段或位置');
   const id=await tasks.evidence(run.id,{kind:'patent',title:patent.id+' · '+patent.title,patent:patent.id,url:patent.sourceUrl,field,offset,quote,question});
   return {evidenceId:id,...(find?{find,found:true}:{}),patentId,title:patent.title,publicationDate:patent.publicationDate,applicants:patent.applicants,ipc:patent.ipc,field,offset,question,totalChars:text.length,nextOffset:offset+quote.length<text.length?offset+quote.length:null,quote};
  },{name:'read_patent',description:'按阅读问题question选择公开编号、field和offset。可用find在所选字段从offset开始不区分大小写查找字面词句，未命中返回found:false；命中从实际位置取片段。默认取2500字符；先读能回答问题的片段，证据足够即停止，需要上下文再按nextOffset分页。nextOffset=null表示该字段已读完。读取本地原文，不额外调用模型；登记逐字引用及位置。',schema:z.object({patentId:z.string(),question:z.string().trim().min(3).max(2000),field:z.enum(['abstract','description','claims']),find:z.string().trim().min(1).max(200).optional(),offset:z.number().int().nonnegative().default(0),length:z.number().int().min(1).max(12000).default(2500)})}),
  tool(async({patentIds,offset})=>{
   if(patentIds.some(id=>!records.some(p=>p.id===id)))throw new ResearchInputError('专利不在当前数据集');
   await progress('正在阅读专利关联论文');
   const reader=new ExternalReferenceReader(pool),available=await reader.paperLinks(patentIds,offset),links=available.slice(0,50),papers=await reader.papers([...new Set(links.map(l=>String(l.work_id)))]);
   const evidence=await Promise.all(papers.map(async paper=>({evidenceId:await tasks.evidence(run.id,{kind:'paper',title:paper.title,url:paper.doi?(String(paper.doi).startsWith('http')?paper.doi:'https://doi.org/'+paper.doi):String(paper.work_id).startsWith('http')?String(paper.work_id):'https://openalex.org/'+paper.work_id},'paper-'+paper.work_id),...paper})));
   return {links,papers:evidence,nextOffset:available.length>50?offset+links.length:null,pageSize:50};
  },{name:'read_patent_papers',description:'读取数据集中专利关联的论文元数据、引用关系与来源链接，并登记论文来源。',schema:z.object({patentIds:z.array(z.string()).min(1).max(10),offset:z.number().int().nonnegative().default(0)})}),
  tool(async record=>{
   await requireConfirmed();
   const saved=await tasks.cycle(run.id,record);
   await progress('研究进展：'+record.question);
   await store.event(run.id,'research-cycle',saved);
   return {saved:true,record:saved,action:'依据当前缺口选择下一步：补充证据、撰写或修订相关章节；问题已回答时进入下一个研究问题。'};
  },{name:'record_research',description:'保存阶段性研究判断及下一步，供持续研究和用户回溯。记录实际发现、支持证据、具体缺口和受影响章节；发现变化后可再次记录同一问题。无需每次工具调用都记录，不保存隐藏思维过程。',schema:z.object({question:z.string().trim().min(3).max(2000),finding:z.string().trim().min(1).max(6000),evidenceIds:z.array(z.string()).max(200),gaps:z.array(z.string().trim().min(1).max(2000)).max(12),nextAction:z.string().trim().min(1).max(2000),chapterIds:z.array(z.string()).max(50)})}),
  tool(async({chapterId})=>{const t=await tasks.get(run.id),chapter=t?.chapters?.find(c=>c.id===chapterId);return chapter||{message:'该章尚未撰写'};},{name:'read_chapter',description:'读取指定章节全文、发现、证据和修订版本。',schema:z.object({chapterId:z.string()})}),
  tool(async({chapterId,body,findings,evidenceIds})=>{
   await requireConfirmed();
   const mentioned=researchPatentMentions(body);
   const unknown=mentioned.filter(id=>!records.some(p=>p.id.toUpperCase()===id)&&!run.results.some(r=>resultPatentNumbers(r).has(id)));
   if(unknown.length)throw new ResearchInputError('正文公开编号未在当前语料或分析证据中找到：'+unknown.join('、')+'。请核对实际编号并阅读原文，不编造案例。');
   for(const match of body.matchAll(/\[\[chart:([^\]]+)\]\]/g))if(!run.results.some(r=>r.id===match[1]&&r.status==='completed'))throw new ResearchInputError('图表编号“'+match[1]+'”不属于当前研究。请使用真实编号：'+run.results.filter(r=>r.status==='completed').map(r=>r.title+' [[chart:'+r.id+']]').join('；'));
   const result=await tasks.chapter(run.id,chapterId,body,findings,evidenceIds);
   const current=(await tasks.get(run.id))!;run.answer=assembleResearchReport({...current,outline:current.outline.filter(c=>current.chapters!.some(saved=>saved.id===c.id))});await store.event(run.id,'text-snapshot',{text:run.answer});
   await progress('章节已保存：'+current.outline.find(c=>c.id===chapterId)!.title+' · 第 '+result.revision+' 版');return {saved:true,...result,researchQuestion:current.outline.find(c=>c.id===chapterId)!.question,recentResearch:current.cycles?.slice(-3),next:'检查本章是否回答问题；若发现证据缺口或与其他章节冲突，继续分析、阅读原文并修订。已有证据充分时推进下一问题，全部完成后综合并调用finish_report。'};
  },{name:'write_chapter',description:'保存或修订一个章节的完整论证及发现，保留历史版本。先回答该章问题，组织主张、支持证据、比较与推理，再写判断；findings记下结论及证据如何支持结论，供跨章继续论证。正文保留研究结论、比较分析、原文证据和必要方法，保留影响判断的范围、缺失情况与成立条件，不写通用免责声明或审计待复核清单。引文引用用 [[source:id]]，图表用 [[chart:id]]。',schema:z.object({chapterId:z.string(),body:z.string().trim().min(100).max(100000),findings:z.string().trim().min(1).max(6000),evidenceIds:z.array(z.string()).max(200)})}),
  tool(async()=>{
   const t=await requireConfirmed();const answer=assembleResearchReport(t);
   const words=t.chapters!.reduce((sum,c)=>sum+researchWordCount(c.body),0);
   if(words<t.input.targetWords)return {ready:false,words,targetWords:t.input.targetWords,message:'请继续研究并充实章节，达到目标篇幅后完成报告'};
   if(!run.results.some(r=>r.status==='completed'))return {ready:false,message:'请先调用分析工具取得支持报告结论的数据'};
   await transaction(pool,async db=>{
    const locked=(await db.query('SELECT report_id FROM research_tasks WHERE id=$1 FOR UPDATE',[run.id])).rows[0];if(locked.report_id)return;
    run.answer=answer;run.status='completed';run.error='';run.progress={tool:'research',unit:'深度报告已完成'};
    await store.saveRun(run);const reportId=await store.saveReport(run,t.title);
    await db.query("UPDATE research_tasks SET status='completed',report_id=$2,error='',updated_at=now() WHERE id=$1",[run.id,reportId]);await store.event(run.id,'text-snapshot',{text:answer});await store.event(run.id,'done',{status:'completed'});
   });return {saved:true,reportId:(await tasks.get(run.id))!.report_id};
  },{name:'finish_report',description:'先核对研究目标、阶段发现与缺口，回读相关章节并解决关键冲突；所有章节及综合摘要完成后，按提纲组装正文，保存到报告库并结束任务。',schema:z.object({})}),
 ];
 const cfg=modelConfig();
 const metered=async<T extends {usage_metadata?:{input_tokens:number|null;output_tokens:number|null;total_tokens:number|null};meterStatus?:'completed'|'failed'}>(call:()=>Promise<T>)=>{
  await checkPause();await new ModelBudget(pool).reserve(run.id);const started=Date.now();let usage:T['usage_metadata'],status:'completed'|'failed'|'cancelled'='failed';
  try{const response=await call();usage=response.usage_metadata;status=response.meterStatus??'completed';return response;}
  catch(error){status=signal.aborted?'cancelled':'failed';throw error;}
  finally{await new ModelUsage(pool).record({kind:'chat',model:cfg.model,provider:cfg.base,status,inputTokens:usage?.input_tokens??null,outputTokens:usage?.output_tokens??null,totalTokens:usage?.total_tokens??null,durationMs:Date.now()-started});}
 };
 // ChatOpenAI.bindTools clones its configuration. Meter the HTTP transport so
 // cloned models and context summarization share the same real request budget.
 const researchFetch:typeof fetch=async(input,init)=>{
  const result=await metered(async()=>{
   const response=await fetch(input,init),payload=await response.clone().json().catch(()=>undefined),usage=providerTokens(payload?.usage);
   return {response,meterStatus:response.ok?'completed' as const:'failed' as const,usage_metadata:{input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,total_tokens:usage.totalTokens}};
  });return result.response;
 };
 // Keep research, chapter writes and outline approval on one persisted execution thread.
 registerHarnessProfile('openai',{generalPurposeSubagent:{enabled:false}});
 const stageSkills=task.input.mode==='confirm_outline'&&!task.outline_confirmed?['research-planning']:['research-iteration','patent-landscape','patent-close-reading','evidence-writing','report-revision','chinese-style'];
 let skillsPinned=false;
 const pinSkills=async()=>{skillsPinned=true;await progress('已加载技能：'+stageSkills.map(id=>RESEARCH_SKILLS.find(s=>s.id===id)!.title).join('、'));return {pinnedSkills:stageSkills};};
 const middleware=createMiddleware({name:'ResearchPersistence',stateSchema:new StateSchema({pinnedSkills:pinnedSkillsValue,researchFeedbackSeen:pinnedSkillsValue.valueSchema}),
  beforeAgent:pinSkills,
  beforeModel:{canJumpTo:['end'],hook:async state=>{await checkPause();const t=await tasks.get(run.id);if(t?.status==='completed')return {jumpTo:'end' as const};const pending=t?.feedback.slice((state.researchFeedbackSeen||[]).length)||[],pins=!skillsPinned?await pinSkills():{};if(pending.length)await progress('已收到补充要求，正在调整研究与正文');return {...pins,...(pending.length?{messages:pending.map(f=>new HumanMessage('用户补充要求：\n'+f.text)),researchFeedbackSeen:t!.feedback.map(f=>f.at)}:{})};}},
  wrapToolCall:async(request,handler)=>{
   try{
    if(request.toolCall.name==='read_file'){const file=String(request.toolCall.args.file_path||request.toolCall.args.path||'');const skill=RESEARCH_SKILLS.find(s=>file==='/skills/'+s.id+'/SKILL.md');if(skill)await progress('正在使用技能：'+skill.title);}
    return await handler(request);
   }catch(error){
    const cause=researchErrorCause(error);
    if(signal.aborted||isGraphBubbleUp(error)||cause instanceof ResearchPaused||cause instanceof ModelBudgetExceeded)throw error;
    if(!(cause instanceof ResearchInputError)&&!(cause instanceof z.ZodError))throw error;
    const message=(error as Error).message;await store.event(run.id,'status',{phase:'Research',message:request.toolCall.name==='write_chapter'?'正在修订章节内容':'正在调整研究步骤'});
    return new ToolMessage({content:JSON.stringify({error:message,action:'请根据错误调整输入，继续研究'}),tool_call_id:request.toolCall.id||'',name:request.toolCall.name,status:'error'});
   }
  },
  wrapModelCall:async(request,handler)=>{
   const t=await tasks.get(run.id),budget=await new ModelBudget(pool).read(run.id);
   const unfinished=t?.outline.filter(item=>!t.chapters?.some(ch=>ch.id===item.id))||[],remainingCalls=budget?budget.max_calls-budget.started_calls:undefined;
   const writingPriority=remainingCalls!==undefined&&Boolean(t?.outline.length)&&remainingCalls<=unfinished.length*2+4;
   const guidance=writingPriority?'剩余调用需兼顾未完成章节、综合和保存。先将现有证据已经支持的论证写入章节；只继续收集会改变判断的关键证据，不默认遍历全部候选或字段。证据不足的论点收窄表述，不能用猜测补齐。若关键证据确实不足，保存已完成研究并说明具体缺口。':'按当前未解问题选择下一步；证据支持的局部判断及时保存为章节，写作中出现新疑问再补证与修订。';
   const call=async()=>handler({...request,systemMessage:request.systemMessage.concat('\n当前研究状态：'+JSON.stringify({budget,remainingCalls,unfinishedChapters:unfinished.map(c=>({id:c.id,question:c.question})),nextActionGuidance:guidance,outline:t?.outline,feedbackCount:t?.feedback.length,researchCycles:t?.cycles?.slice(-8),chapters:t?.chapters?.map(c=>({id:c.id,revision:c.revision,findings:c.findings}))}))});
   return overrides.model?metered(call):call();
  },
 });
 const model=overrides.model||new ChatOpenAI({model:cfg.model,apiKey:cfg.key,configuration:{baseURL:cfg.base,fetch:researchFetch},disableStreaming:true,...(cfg.base.includes('dashscope.aliyuncs.com')?{modelKwargs:{enable_thinking:false}}:{}),temperature:0.2,maxTokens:12000,maxRetries:0,timeout:180000});
 try{
  const backend=new CompositeBackend(new StateBackend(),{'/skills/':new FilesystemBackend({rootDir:path.join(process.cwd(),'skills/research'),virtualMode:true})});
  const agent=await createDeepAgent({model,tools,backend,skills:['/skills/'],permissions:[{paths:['/skills/**'],operations:['write'],mode:'deny'}],systemPrompt:instructions+'\n'+REPORT_WRITING_GUIDANCE,checkpointer,middleware:[middleware],subagents:[]});
  const state=await agent.graph.getState(config),isInterrupted=state.tasks.some(t=>t.interrupts?.length);
  await progress(saved?'继续已保存的研究':'正在了解研究目标与数据');
  let input:Parameters<typeof agent.invoke>[0]=isInterrupted?new Command({resume:{action:task.outline_confirmed?'confirm':'revise'}}):saved&&state.next.length?null:{messages:[{role:'user',content:JSON.stringify({continueResearch:Boolean(saved),goal:task.input.goal,targetWords:task.input.targetWords,dataset:{id:meta.id,name:meta.name,count:meta.count,years:meta.years},mode:task.input.mode})}]};
  for(;;){
   await agent.invoke(input,config);
   const final=(await tasks.get(run.id))!;
   if(final.status==='awaiting_outline'){run.status='interrupted';await store.saveRun(run);return;}
   if(final.status==='completed')return;
   await checkPause();
   input={messages:[{role:'user',content:'继续围绕尚未回答的研究问题开展工作。先核对 research_state 中阶段发现、缺口和章节，再自行决定补检索、读取原文、分析或修订。写作中出现新疑问时回到证据，形成新发现后更新 record_research 和相关章节；不要只继续扩写。研究问题回答充分后完成综合与事实核对，再调用 finish_report。'}]};
  }
 }catch(error){
  if(signal.aborted)throw error;
  const cause=researchErrorCause(error);
  if(cause instanceof ResearchPaused){run.status='interrupted';run.error='';await store.saveRun(run);return;}
  const message=cause instanceof Error?cause.message:(error as Error).message;await tasks.status(run.id,cause instanceof ModelBudgetExceeded?'paused':'failed',message);run.status='interrupted';run.error=message;await store.saveRun(run);throw cause;
 }
}
