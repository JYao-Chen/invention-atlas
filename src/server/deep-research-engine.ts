import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {tool} from '@langchain/core/tools';
import {ToolMessage} from '@langchain/core/messages';
import type {BaseLanguageModel} from '@langchain/core/language_models/base';
import {ChatOpenAI} from '@langchain/openai';
import {createMiddleware} from 'langchain';
import {createDeepAgent,registerHarnessProfile} from 'deepagents';
import {Command,interrupt,isGraphBubbleUp} from '@langchain/langgraph';
import type {Run,AnalysisResult} from '../lib/types';
import {DeepResearchStore,assembleResearchReport,outlineSchema,ResearchInputError} from './deep-research-store';
import {ResearchCheckpointer} from './research-checkpointer';
import {PostgresStore} from './postgres-store';
import {executeTool,TOOL_DEFS} from './tools';
import {ExternalReferenceReader} from './external/store';
import {nameClusterTopics} from './cluster-topics';
import {reportResult} from './report-input';
import {REPORT_WRITING_GUIDANCE} from './report-preparation';
import {readResult,toolInformation} from './result-contract';
import {transaction} from './postgres';
import {modelConfig} from './config';
import {ModelBudget,ModelBudgetExceeded} from './model-budget';
import {ModelUsage,providerTokens} from './model-usage';

class ResearchPaused extends Error{constructor(){super('研究已暂停');}}
function researchErrorCause(error:unknown):unknown{while(error instanceof Error&&error.cause instanceof Error)error=error.cause;return error;}

const instructions=`你是 Invention Atlas 的深度研究助手，负责独立完成可供阅读的中文专业报告。
工作方式：先了解数据和用户目标，自主规划研究问题与章节；调用分析工具、检索并阅读原文，把发现与证据保存下来；逐章写作，根据新发现调整研究和提纲；对照各章发现再做综合和摘要，最后保存整篇报告。研究路径由问题和证据决定。
必须先用 propose_outline 保存提纲，再用 confirm_outline 确认；确认前只能进行了解数据所需的研究。保存提纲后再单独调用确认工具；确认后再开始写作；完成各章保存后单独调用 finish_report。用户确认的提纲可以补充和调整，保留已写章节的编号。每章建议800至2500字，长篇通过更多章节完成。摘要与综合章节在主体分析完成后撰写，排列顺序可在提纲中提前。
使用 research_state 查看最新反馈、提纲及章节摘要，用 read_chapter 阅读正文，避免反复将整份报告放入对话。用工作区文件记录研究笔记和待解决问题。
run_analysis 可调用系统分析工具；read_result 分页读取完整结果。统计数字必须来自工具结果。read_patent 提供已保存的原文和精确位置，可继续分页阅读。read_patent_papers 读取专利关联论文元数据与来源，适合研究科学知识来源。
按目标篇幅安排研究深度，选择能够回答研究问题的分析与原文。需要阅读几段原文时直接使用 read_patent；analyze_patent_reading 会对整篇全文分段调用模型，仅在需要系统整理全文笔记时使用。预算接近上限时，优先完成已有研究的章节与综合。先研究再写作，跨章节对照统计口径、年份、主体和技术主题，必要时补充工具调用、改写已有章节。用 write_chapter 保存完整正文和该章发现；修订时重新提交该章全文。
用户没有专门询问时，缺失字段、覆盖不足、样本偏差、不能外推、非法律意见等内容直接略过；不要将这些提醒夹在分析段落中。数据名称、记录数、年份和计数口径作为事实简要介绍。交付前通读各章，删除主动附加的免责声明和人工复核提醒。正文以结论、比较、解释和实例为主，写出研究问题的回答。直接介绍方法和数据范围，删除重复免责声明、泛泛的局限章节、自动审计待复核清单、提示词和写作过程。数据无法支持的问题转为下一步具体研究问题，不编造数值、专利或引文。
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
   const t=(await tasks.get(run.id))!;return {goal:t.input.goal,targetWords:t.input.targetWords,title:t.title,outline:t.outline,confirmed:t.outline_confirmed,feedback:t.feedback,
    budget:await new ModelBudget(pool).read(run.id),chapters:t.chapters?.map(({id,revision,findings,body})=>({id,revision,findings,words:body.length})),evidence:t.evidence?.map(e=>({id:e.id,title:e.payload.title,kind:e.payload.kind})),dataset:meta,
    tools:TOOL_DEFS.filter(d=>d[0]!=='monitor_patent_changes').map(d=>({name:d[0],title:d[1],...toolInformation(d[0])}))};
  },{name:'research_state',description:'读取研究目标、最新用户要求、提纲、已写章节发现、证据目录与系统分析工具说明。',schema:z.object({})}),
  tool(async({title,outline})=>{await tasks.outline(run.id,title,outline);await progress('提纲已更新：'+title);return {saved:true,outline};},{name:'propose_outline',description:'保存或调整报告提纲。以研究问题组织章节，给出字数，保留已写章节编号。',schema:z.object({title:z.string().min(1).max(200),outline:outlineSchema})}),
  tool(async()=>{
   const t=await tasks.get(run.id);if(!t?.outline.length)throw new ResearchInputError('请先保存提纲');
   if(task.input.mode==='confirm_outline'){
    if(!t.outline_confirmed)await tasks.status(run.id,'awaiting_outline');
    interrupt({kind:'outline',message:'请确认研究提纲后继续'});
   }
   await tasks.status(run.id,'running');return {confirmed:true,outline:(await tasks.get(run.id))!.outline};
  },{name:'confirm_outline',description:'提纲准备好后调用。默认等待用户确认；全自动模式直接继续。',schema:z.object({})}),
  tool(async({name,params})=>{
   if(!TOOL_DEFS.some(d=>d[0]===name)||name==='monitor_patent_changes')throw new ResearchInputError('请选择研究工具目录中的分析工具');
   await progress('正在分析：'+TOOL_DEFS.find(d=>d[0]===name)![1]);
   const entityRules=JSON.parse((await store.setting('entities:'+run.datasetId))||'[]');
   let progressWrites=Promise.resolve();
   let result:AnalysisResult;
   try{
    result=await (overrides.execute||executeTool)(name,params,meta,records,{entityRules,nameTopics:nameClusterTopics,semantic:['search_patents','search_patent_passages'].includes(name),signal,
     onWork:(done,total,unit)=>{progressWrites=progressWrites.then(async()=>{await checkPause();run.progress={tool:name,done,total,unit};await store.saveRun(run);await store.event(run.id,'progress',run.progress);});},
    }).finally(()=>progressWrites);
   }catch(error){
    const cause=researchErrorCause(error);if(signal.aborted||cause instanceof ResearchPaused||cause instanceof ModelBudgetExceeded)throw error;
    result={id:randomUUID(),tool:name,title:TOOL_DEFS.find(d=>d[0]===name)![1],datasetId:meta.id,status:'failed',params:{},summary:(error as Error).message,rows:[],method:'',warnings:[],evidence:[],createdAt:new Date().toISOString()};
   }
   signal.throwIfAborted();
   await transaction(pool,async()=>{run.results.push(result);await store.saveResult(result);await store.saveRun(run);if(result.status==='completed')await tasks.evidence(run.id,{kind:'result',title:result.title,resultId:result.id},result.id);});
   return reportResult(result);
  },{name:'run_analysis',description:'执行目录中的分析工具，保存完整结果并返回数据预览、结果编号；可用该编号引用图表与数据。',schema:z.object({name:z.string(),params:z.record(z.unknown())})}),
  tool(async({resultId,...input})=>{const result=run.results.find(r=>r.id===resultId);if(!result)throw new ResearchInputError('该分析结果不属于当前研究');return readResult(result,input);},{name:'read_result',description:'按结果编号分页读取完整分析数据。',schema:z.object({resultId:z.string(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(50),word:z.string().optional(),year:z.string().optional(),section:z.string().optional()})}),
  tool(async({patentId,field,offset,length})=>{
   const record=records.find(p=>p.id===patentId);if(!record)throw new ResearchInputError('专利不在当前数据集');
   await progress('正在阅读原文：'+patentId);
   const patent=await store.fullPatent(run.datasetId,record),text=field==='claims'?patent.claims.map(c=>c.number+'. '+c.text).join('\n\n'):patent[field];
   const quote=text.slice(offset,offset+length);if(!quote)throw new ResearchInputError('该原文位置没有内容，请选择其他字段或位置');
   const id=await tasks.evidence(run.id,{kind:'patent',title:patent.id+' · '+patent.title,patent:patent.id,url:patent.sourceUrl,field,offset,quote});
   return {evidenceId:id,patentId,title:patent.title,field,offset,totalChars:text.length,nextOffset:offset+quote.length,quote};
  },{name:'read_patent',description:'按公开编号阅读摘要、说明书或权利要求原文，登记可引用的原文证据；分页继续阅读。',schema:z.object({patentId:z.string(),field:z.enum(['abstract','description','claims']),offset:z.number().int().nonnegative().default(0),length:z.number().int().min(1).max(12000).default(6000)})}),
  tool(async({patentIds,offset})=>{
   if(patentIds.some(id=>!records.some(p=>p.id===id)))throw new ResearchInputError('专利不在当前数据集');
   await progress('正在阅读专利关联论文');
   const reader=new ExternalReferenceReader(pool),links=(await reader.paperLinks(patentIds,offset)).slice(0,50),papers=await reader.papers([...new Set(links.map(l=>String(l.work_id)))]);
   const evidence=await Promise.all(papers.map(async paper=>({evidenceId:await tasks.evidence(run.id,{kind:'paper',title:paper.title,url:paper.doi?(String(paper.doi).startsWith('http')?paper.doi:'https://doi.org/'+paper.doi):paper.work_id},'paper-'+paper.work_id),...paper})));
   return {links,papers:evidence,nextOffset:offset+links.length,pageSize:50};
  },{name:'read_patent_papers',description:'读取数据集中专利关联的论文元数据、引用关系与来源链接，并登记论文来源。',schema:z.object({patentIds:z.array(z.string()).min(1).max(10),offset:z.number().int().nonnegative().default(0)})}),
  tool(async({chapterId})=>{const t=await tasks.get(run.id),chapter=t?.chapters?.find(c=>c.id===chapterId);return chapter||{message:'该章尚未撰写'};},{name:'read_chapter',description:'读取指定章节全文、发现、证据和修订版本。',schema:z.object({chapterId:z.string()})}),
  tool(async({chapterId,body,findings,evidenceIds})=>{
   await requireConfirmed();for(const match of body.matchAll(/\[\[chart:([^\]]+)\]\]/g))if(!run.results.some(r=>r.id===match[1]&&r.status==='completed'))throw new ResearchInputError('图表编号不属于当前研究');
   const result=await tasks.chapter(run.id,chapterId,body,findings,evidenceIds);
   const current=(await tasks.get(run.id))!;run.answer=assembleResearchReport({...current,outline:current.outline.filter(c=>current.chapters!.some(saved=>saved.id===c.id))});await store.event(run.id,'text-snapshot',{text:run.answer});
   await progress('章节已保存：'+current.outline.find(c=>c.id===chapterId)!.title+' · 第 '+result.revision+' 版');return {saved:true,...result};
  },{name:'write_chapter',description:'保存或修订一个章节的完整正文及发现，保留历史版本。正文只保留研究结论、比较分析、原文证据和必要方法，不写免责声明、未提供字段或审计待复核清单。引文引用用 [[source:id]]，图表用 [[chart:id]]。',schema:z.object({chapterId:z.string(),body:z.string().trim().min(100).max(100000),findings:z.string().trim().min(1).max(6000),evidenceIds:z.array(z.string()).max(200)})}),
  tool(async()=>{
   const t=await requireConfirmed();const answer=assembleResearchReport(t);
   const words=t.chapters!.reduce((sum,c)=>sum+c.body.length,0);
   if(words<t.input.targetWords*0.8)return {ready:false,words,targetWords:t.input.targetWords,message:'请继续研究并充实章节，达到目标篇幅后完成报告'};
   if(!run.results.some(r=>r.status==='completed'))return {ready:false,message:'请先调用分析工具取得支持报告结论的数据'};
   await transaction(pool,async db=>{
    const locked=(await db.query('SELECT report_id FROM research_tasks WHERE id=$1 FOR UPDATE',[run.id])).rows[0];if(locked.report_id)return;
    run.answer=answer;run.status='completed';run.error='';run.progress={tool:'research',unit:'深度报告已完成'};
    await store.saveRun(run);const reportId=await store.saveReport(run,t.title);
    await db.query("UPDATE research_tasks SET status='completed',report_id=$2,error='',updated_at=now() WHERE id=$1",[run.id,reportId]);await store.event(run.id,'text-snapshot',{text:answer});await store.event(run.id,'done',{status:'completed'});
   });return {saved:true,reportId:(await tasks.get(run.id))!.report_id};
  },{name:'finish_report',description:'所有章节及综合摘要完成后，按提纲组装正文，保存到报告库并结束任务。',schema:z.object({})}),
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
 const middleware=createMiddleware({name:'ResearchPersistence',
  beforeModel:{canJumpTo:['end'],hook:async()=>{await checkPause();const t=await tasks.get(run.id);if(t?.status==='completed')return {jumpTo:'end' as const};}},
  wrapToolCall:async(request,handler)=>{
   try{return await handler(request);}catch(error){
    const cause=researchErrorCause(error);
    if(signal.aborted||isGraphBubbleUp(error)||cause instanceof ResearchPaused||cause instanceof ModelBudgetExceeded)throw error;
    if(!(cause instanceof ResearchInputError)&&!(cause instanceof z.ZodError))throw error;
    const message=(error as Error).message;await store.event(run.id,'status',{phase:'Research',message:request.toolCall.name==='write_chapter'?'正在修订章节内容':'正在调整研究步骤'});
    return new ToolMessage({content:JSON.stringify({error:message,action:'请根据错误调整输入，继续研究'}),tool_call_id:request.toolCall.id||'',name:request.toolCall.name,status:'error'});
   }
  },
  wrapModelCall:async(request,handler)=>{
   const t=await tasks.get(run.id),budget=await new ModelBudget(pool).read(run.id);
   const call=async()=>handler({...request,systemMessage:request.systemMessage.concat('\n当前研究状态：'+JSON.stringify({budget,outline:t?.outline,feedback:t?.feedback,chapters:t?.chapters?.map(c=>({id:c.id,revision:c.revision,findings:c.findings}))}))});
   return overrides.model?metered(call):call();
  },
 });
 const model=overrides.model||new ChatOpenAI({model:cfg.model,apiKey:cfg.key,configuration:{baseURL:cfg.base,fetch:researchFetch},disableStreaming:true,...(cfg.base.includes('dashscope.aliyuncs.com')?{modelKwargs:{enable_thinking:false}}:{}),temperature:0.4,maxTokens:12000,maxRetries:0,timeout:180000});
 try{
  const agent=await createDeepAgent({model,tools,systemPrompt:instructions+'\n'+REPORT_WRITING_GUIDANCE,checkpointer,middleware:[middleware],subagents:[]});
  const state=await agent.graph.getState(config),isInterrupted=state.tasks.some(t=>t.interrupts?.length);
  await progress(saved?'继续已保存的研究':'正在了解研究目标与数据');
  let input:Parameters<typeof agent.invoke>[0]=isInterrupted?new Command({resume:true}):saved&&state.next.length?null:{messages:[{role:'user',content:JSON.stringify({continueResearch:Boolean(saved),goal:task.input.goal,targetWords:task.input.targetWords,dataset:{id:meta.id,name:meta.name,count:meta.count,years:meta.years},mode:task.input.mode})}]};
  for(;;){
   await agent.invoke(input,config);
   const final=(await tasks.get(run.id))!;
   if(final.status==='awaiting_outline'){run.status='interrupted';await store.saveRun(run);return;}
   if(final.status==='completed')return;
   await checkPause();
   input={messages:[{role:'user',content:'请根据最新研究状态继续完成任务。使用 write_chapter 保存各章正文，根据发现补充分析或修订，全部完成后调用 finish_report 保存报告。'}]};
  }
 }catch(error){
  if(signal.aborted)throw error;
  const cause=researchErrorCause(error);
  if(cause instanceof ResearchPaused){run.status='interrupted';run.error='';await store.saveRun(run);return;}
  const message=cause instanceof Error?cause.message:(error as Error).message;await tasks.status(run.id,cause instanceof ModelBudgetExceeded?'paused':'failed',message);run.status='interrupted';run.error=message;await store.saveRun(run);throw cause;
 }
}
