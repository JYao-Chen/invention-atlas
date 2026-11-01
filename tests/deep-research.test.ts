import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {BaseChatModel} from '@langchain/core/language_models/chat_models';
import {AIMessage,HumanMessage,type BaseMessage} from '@langchain/core/messages';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import {postgresPool,withAccess,type AccessScope} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {PostgresStore} from '../src/server/postgres-store';
import {DeepResearchStore,assembleResearchReport,researchInput,outlineSchema,openResearchQuestions,briefSchema} from '../src/server/deep-research-store';
import {ResearchCheckpointer} from '../src/server/research-checkpointer';
import {executeDeepResearch} from '../src/server/deep-research-engine';
import {normalize,datasetMeta} from '../src/server/importers';
import {withModelSettings} from '../src/server/config';
import {ModelBudget} from '../src/server/model-budget';
import {executeTool} from '../src/server/tools';
import {requireResearchSelection,researchToolPolicy,requireResearchCapacity} from '../src/server/research-tool-policy';
import {researchResultPreview,researchResultPage} from '../src/server/research-results';
import type {AnalysisResult} from '../src/lib/types';
import {researchWordCount} from '../src/lib/research-words';
import {researchEditorialIssues,researchPatentMentions} from '../src/server/research-editorial';
import {withModelRun} from '../src/server/model-usage';

class ScriptedModel extends BaseChatModel{
 step=0;calls:{name:string;args:Record<string,unknown>}[]=[];
 constructor(private readonly script:(step:number,messages:BaseMessage[])=>{name:string;args:Record<string,unknown>}){super({});}
 _llmType(){return 'research-test';}
 bindTools(){return this;}
 async _generate(messages:BaseMessage[]){
  const last=messages.at(-1);let call:{name:string;args:Record<string,unknown>}|undefined;
  if(last?.name==='finish_report'||last?.name==='read_report'){
   try{const result=JSON.parse(String(last.content));if(result.reviewRequired){
    if(last.name==='read_report'){assert.ok(result.chapters.every((c:{body:string})=>c.body.length>=100));call={name:'finish_report',args:{review:{revisions:result.revisions,summary:'已回读完整章节，核对研究问题、正文与引用，确认当前测试数据一致。'}}};}
    else call={name:'read_report',args:{}};
   }}catch(error){if(error instanceof assert.AssertionError)throw error;}
  }
  call??=this.script(this.step++,messages);
  if(call.name==='finish_report'&&!call.args.review)call={name:'read_report',args:{}};
  this.calls.push(call);return {generations:[{text:'',message:new AIMessage({content:call.name==='end_naturally'?'已整理当前发现。':'',tool_calls:call.name==='end_naturally'?[]:[{id:'call_'+this.calls.length,type:'tool_call',...call}],usage_metadata:{input_tokens:10,output_tokens:10,total_tokens:20}})}]};
 }

}
const brief={intent:'研究身份认证方案',audience:'研发团队',scope:'测试资料',questions:[],approach:['比较实际原文'],changes:''};
const outline=[{id:'overview',title:'数据与技术全景',question:'技术全景如何？',targetWords:500},{id:'directions',title:'研发方向',question:'下一步研究什么？',targetWords:500}];
const prose='在本次检索范围内，观察到的联系可能与分类有关。专利所述效果属于原文声明，非独立实验验证。'+ '研究数据展示了技术措施与应用目标之间的联系。通过逐项阅读公开文本，可以比较不同方案的设计与技术效果，并结合分析结果进一步确定研究方向。'.repeat(8);

test('deep report defaults to outline confirmation and preserves dynamic chapter ids',()=>{
 assert.equal(researchInput.parse({datasetId:'d',goal:'研究技术路线'}).mode,'confirm_outline');
 const {changes,...initialBrief}=brief;assert.equal(briefSchema.parse(initialBrief).changes,'');
 assert.equal(outlineSchema.safeParse([outline[0],outline[0]]).success,false);
});

test('native Deep Agents pauses for edited outline, resumes tools and saves revised chapters and report under project RLS',async()=>{
 const admin=postgresPool(process.env.DATABASE_URL),identity=new IdentityStore(admin),role='research_'+randomUUID().replaceAll('-','');let runtime:ReturnType<typeof postgresPool>|undefined;
 const schema=(await admin.query('SELECT current_schema() schema')).rows[0].schema;
 try{
  const record=normalize({id:'US9021001B1',title:'Synthetic identity verification',abstract:'A digital identity verification system.',description:'Original description of identity verification.',claims:[{number:1,text:'A digital verification apparatus.'}],publication_date:'2024-01-01',applicants:['Test A'],ipc:['H04L9/00']},'UNIT TEST ONLY');
  const meta=datasetMeta('深度报告测试',[record],'unit-test','fixture');await new PostgresStore(admin).saveDataset(meta,[record]);
  await admin.query("INSERT INTO external_sources(id,name,version,url,license,retrieved_at,subset_rule) VALUES('research-test','Synthetic source','test','https://example.org','test',now(),'fixture')");
  await admin.query("INSERT INTO ext_papers(work_id,title,retrieved_at,source_id) VALUES('W9021001','Synthetic paper',now(),'research-test')");
  await admin.query("INSERT INTO ext_patent_paper_links(patent_number,work_id,source_id) VALUES('US9021001','W9021001','research-test')");
  const initialized=await identity.initializeAdmin('research-owner','research-password-123','Research test');
  const readerInvite=await identity.createInvite(initialized.user!.id,initialized.organizationId),reader=await identity.registerInvitation(readerInvite.token,'research-reader','research-password-123','Reader');
  await identity.setProjectMember(initialized.user!.id,initialized.projectId,reader.user.id,'reader');
  const foreignOrg=await identity.createOrganization(initialized.user!.id,'Other org'),foreignProject=await identity.createProject(initialized.user!.id,foreignOrg.id,'Other project');
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  const pool=runtime,scope:AccessScope={userId:initialized.user!.id,organizationId:initialized.organizationId,projectId:initialized.projectId},tasks=new DeepResearchStore(pool),store=new PostgresStore(pool);
  await withAccess(scope,async()=>{
   const task=await tasks.create({datasetId:meta.id,goal:'研究身份认证技术路线',targetWords:1000,maxModelCalls:30},'test');
   let sourceId='';
   const model=new ScriptedModel((step,messages)=>{
    if(step===20){assert.ok(JSON.stringify(messages).includes('全部章节已保存。现在进入交付'));assert.ok(String(messages.at(-1)!.content).includes('通过 write_chapter 保存'));assert.equal(messages.at(-1)!.getType(),'tool');}
    if(step===8)sourceId=JSON.parse(String([...messages].reverse().find(m=>m._getType()==='tool')!.content)).evidenceId;
    if(step===9){const reused=JSON.parse(String(messages.at(-1)!.content));assert.equal(reused.evidenceId,sourceId);assert.equal(reused.quote,record.abstract);assert.equal(reused.question,'身份认证的实现步骤是什么？');}
    if(step===10){const page=JSON.parse(String(messages.at(-1)!.content));assert.equal(page.links.length,1);assert.equal(page.nextOffset,null);}
    if(step===11){const page=JSON.parse(String(messages.at(-1)!.content));assert.equal(page.links.length,0);assert.equal(page.nextOffset,null);}
    if(step===12){const found=JSON.parse(String(messages.at(-1)!.content));assert.equal(found.found,true);assert.equal(found.offset,record.description.indexOf('verification'));assert.equal(found.quote,'verification.');}
    if(step===13){const missing=JSON.parse(String(messages.at(-1)!.content));assert.equal(missing.found,false);assert.equal(missing.nextOffset,null);}
    if(step===5)assert.ok(messages.some(m=>m instanceof HumanMessage&&String(m.content).includes('更重视权利要求比较')));
    if(step===1)assert.ok(JSON.stringify(messages).includes('研究规划'),JSON.stringify(messages.at(-1)!.content));
    const calls=[{name:'read_file',args:{file_path:'/skills/research-planning/SKILL.md'}},{name:'research_state',args:{}},{name:'run_analysis',args:{question:'本次研究数据与问题如何对应？',name:'get_dataset_summary',params:{}}},{name:'propose_outline',args:{title:'身份认证研究',outline,brief}},{name:'confirm_outline',args:{}},
     {name:'propose_outline',args:{title:'身份认证研究',outline,brief:{intent:'比较认证方案',audience:'研发团队',scope:'测试资料',questions:['更关注哪种认证场景？'],approach:['阅读权利要求'],changes:'补充权利要求比较'}}},
     {name:'confirm_outline',args:{}},
     {name:'read_patent',args:{patentId:record.id,question:'身份认证的实现步骤是什么？',field:'abstract',offset:0,length:6000}},
     {name:'read_evidence',args:{evidenceId:sourceId}},
     {name:'read_patent_papers',args:{patentIds:[record.id],offset:0}},
     {name:'read_patent_papers',args:{patentIds:[record.id],offset:50}},
     {name:'read_patent',args:{patentId:record.id,question:'verification原文在哪里？',field:'description',find:'VERIFICATION',offset:0,length:1000}},
     {name:'read_patent',args:{patentId:record.id,question:'是否包含不存在的字面术语？',field:'description',find:'absent literal',offset:0,length:1000}},
     {name:'write_chapter',args:{chapterId:'overview',body:prose+' [[source:'+sourceId+']]',findings:'技术与身份认证有关',evidenceIds:[sourceId,sourceId]}},
     {name:'record_research',args:{question:'认证措施是否足以解释效果？',finding:'摘要只说明认证对象，需要核对实际条款。',evidenceIds:[sourceId],gaps:['技术措施需回到权利要求核查'],nextAction:'读取权利要求，再修订已写章节。',chapterIds:['overview']}},
     {name:'read_patent',args:{patentId:record.id,question:'权利要求如何限定认证措施？',field:'claims',offset:0,length:1000}},
     {name:'record_research',args:{question:'认证措施是否足以解释效果？',finding:'已读权利要求限定verification apparatus；原文声明与实验效果分别表述。',evidenceIds:[sourceId],gaps:[],nextAction:'将条款发现并入比较，收窄效果判断，修订概述。',chapterIds:['overview','directions']}},
     {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'进一步比较认证流程',evidenceIds:[]}},
     {name:'write_chapter',args:{chapterId:'overview',body:prose+'经过跨章比较后修订。 [[source:'+sourceId+']]',findings:'比较完成并修订',evidenceIds:[sourceId]}},
     {name:'edit_file',args:{file_path:'/skills/chinese-style/SKILL.md',old_string:'指导',new_string:'正文'}},
     {name:'finish_report',args:{review:{revisions:{overview:1,directions:1},summary:'旧版本核对结果不能用于已修订的第二版章节。'}}}];
    assert.ok(calls[step], 'agent continued after finish_report');return calls[step];
   });
   const execute=()=>withModelRun(task.id,async()=>executeDeepResearch(pool,(await store.run(task.id))!,new AbortController().signal,{model}));
   await execute();assert.equal(model.step,5);assert.equal((await tasks.get(task.id))!.status,'awaiting_outline');
   const checkpointer=new ResearchCheckpointer(pool,task.id),cp=await checkpointer.getTuple({configurable:{thread_id:task.id}});assert.ok(cp);assert.ok(cp.pendingWrites?.length);
   const history=[];for await(const entry of checkpointer.list({configurable:{thread_id:task.id}},{limit:2}))history.push(entry);assert.equal(history.length,2);
   await pool.query("UPDATE jobs SET state='completed' WHERE run_id=$1",[task.id]);
   await tasks.resume(task.id,false,undefined,'更重视权利要求比较');await execute();
   const revised=(await tasks.get(task.id))!;assert.equal(revised.status,'awaiting_outline');assert.equal(revised.outline_confirmed,false);assert.equal(revised.chapters?.length,0);assert.equal(revised.brief?.audience,'研发团队');assert.equal(revised.planning_history?.length,2);
   await pool.query("UPDATE jobs SET state='completed' WHERE run_id=$1",[task.id]);
   const edited=outline.map((c,i)=>i===0?{...c,title:'用户确认的数据与全景'}:c);await tasks.resume(task.id,true,edited);await tasks.feedback(task.id,'增加跨章比较');
   await execute();const completed=(await tasks.get(task.id))!;assert.equal(completed.status,'completed');assert.ok(completed.report_id);assert.equal(completed.outline[0].title,edited[0].title);assert.equal(completed.chapters?.length,2);assert.equal(completed.evidence!.filter(e=>e.payload.kind==='patent').length,3);assert.equal(completed.evidence!.find(e=>e.payload.kind==='paper')!.payload.url,'https://openalex.org/W9021001');const finalState=await new ResearchCheckpointer(pool,task.id).getTuple({configurable:{thread_id:task.id}});assert.equal((finalState!.checkpoint.channel_values.researchFeedbackSeen as string[]).length,2);assert.equal((finalState!.checkpoint.channel_values.messages as BaseMessage[]).filter(m=>m instanceof HumanMessage&&m.content==='用户补充要求：\n更重视权利要求比较').length,1);
   assert.equal((await tasks.versions(task.id,'overview')).length,2);assert.equal(completed.chapters?.find(c=>c.id==='overview')?.revision,2);assert.equal(completed.cycles?.length,7);const explicit=completed.cycles!.filter(c=>c.question==='认证措施是否足以解释效果？');assert.equal(explicit[0].gaps.length,1);assert.equal(explicit[1].gaps.length,0);assert.ok(completed.cycles!.some(c=>c.chapterIds.includes('directions')&&c.finding==='进一步比较认证流程'));const savedChapter=completed.chapters!.find(c=>c.id==='overview')!;const unchanged=await tasks.chapter(task.id,savedChapter.id,savedChapter.body,savedChapter.findings,[...savedChapter.evidence_ids,...savedChapter.evidence_ids]);assert.equal(unchanged.changed,false);assert.equal(unchanged.revision,2);assert.equal((await tasks.versions(task.id,'overview')).length,2);assert.equal((await tasks.get(task.id))!.cycles!.length,7);assert.ok(JSON.stringify((await new ResearchCheckpointer(pool,task.id).getTuple({configurable:{thread_id:task.id}}))?.checkpoint.channel_values).includes('技术措施需回到权利要求核查'));
   const report=(await store.reports()).find(r=>r.id===completed.report_id)!;assert.ok(report.run.answer.includes('用户确认的数据与全景'));assert.ok(report.run.answer.includes('[1]'));assert.ok(report.run.answer.includes('资料来源'));assert.ok(report.run.answer.includes('经过跨章比较后修订'));assert.equal(report.run.results.length,1);
   await assert.rejects(tasks.cycle(task.id,{question:'测试问题',finding:'测试发现',evidenceIds:['unknown-evidence'],gaps:[],nextAction:'继续',chapterIds:['overview']}),/尚未登记/);
   await assert.rejects(tasks.chapter(task.id,'overview',prose,'unsupported',['unknown-evidence']),/尚未登记/);
   await assert.rejects(tasks.outline(task.id,'new title',[{...outline[0],id:'replacement'},outline[1]]),/保留编号/);
   const readScope={...scope,userId:reader.user.id};assert.equal((await withAccess(readScope,()=>tasks.get(task.id)))?.chapters?.length,2);await withAccess(readScope,()=>tasks.feedback(task.id,'reader feedback'));assert.equal((await tasks.get(task.id))!.feedback.length,2);await assert.rejects(withAccess(readScope,()=>tasks.chapter(task.id,'overview',prose,'reader',[])),/提纲|权限|row-level/);
   const foreignScope={...scope,organizationId:foreignOrg.id,projectId:foreignProject.id};assert.equal(await withAccess(foreignScope,()=>tasks.get(task.id)),undefined);assert.equal(await withAccess(foreignScope,()=>new ResearchCheckpointer(pool,task.id).getTuple({configurable:{thread_id:task.id}})),undefined);
   await tasks.cycle(task.id,{question:'原文是否提供实测收益？',finding:'原文无实测，正文仅比较技术机制并保留验证问题。',evidenceIds:[sourceId],gaps:['原文没有实测数据'],nextAction:'按限定范围交付。',chapterIds:['overview'],resolution:{kind:'scoped',reason:'概述结论已收窄为原文技术机制比较，未作性能优越判断。'}});
   const scoped=(await tasks.get(task.id))!.cycles!.at(-1)!;assert.equal(scoped.resolution?.kind,'scoped');assert.equal(scoped.gaps.length,1);assert.deepEqual(openResearchQuestions((await tasks.get(task.id))!.cycles),[]);
   // Full automation continues after a natural-language stop and survives a budget stop.
   const automatic=await tasks.create({datasetId:meta.id,goal:'全自动完成技术研究',mode:'automatic',targetWords:1200,maxModelCalls:10},'test');
   const automaticModel=new ScriptedModel(step=>[
    {name:'run_analysis',args:{question:'本次研究数据与问题如何对应？',name:'analyze_patent_reading',params:{patent_numbers:[record.id]}}},
    {name:'run_analysis',args:{question:'本次研究数据与问题如何对应？',name:'get_dataset_summary',params:{}}},
    {name:'propose_outline',args:{title:'自动研究',outline,brief}},
    {name:'write_chapter',args:{chapterId:'overview',body:prose,findings:'已完成概况研究',evidenceIds:[]}},
    {name:'end_naturally',args:{}},
    {name:'finish_report',args:{}},
    {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'形成研究方向',evidenceIds:[]}},
    {name:'finish_report',args:{}},
    {name:'write_chapter',args:{chapterId:'overview',body:prose.repeat(2),findings:'补充实际技术比较',evidenceIds:[]}},
    {name:'finish_report',args:{}},
   ][step]);
   await new ModelBudget(pool).set(automatic.id,2);
   const automaticExecute=()=>withModelRun(automatic.id,async()=>executeDeepResearch(pool,(await store.run(automatic.id))!,new AbortController().signal,{model:automaticModel,execute:async(name,input,meta,records,context)=>{if(name==='get_dataset_summary')for(let i=0;i<=10000;i++)context?.onWork?.(i,10000,'high-volume progress');if(name==='analyze_patent_reading')throw new Error('阅读底稿引文不能定位到原文');return executeTool(name,input,meta,records,context);}}));
   await assert.rejects(automaticExecute(),/预算上限/);assert.equal((await tasks.get(automatic.id))!.status,'paused');assert.equal(automaticModel.step,2);
   assert.equal((await new ModelBudget(pool).read(automatic.id)).started_calls,2);
   await new ModelBudget(pool).set(automatic.id,13);await tasks.resume(automatic.id);await automaticExecute();
   const autoCompleted=(await tasks.get(automatic.id))!;assert.equal(autoCompleted.status,'completed');assert.equal(autoCompleted.chapters?.length,2);assert.equal(automaticModel.step,10);const failedId=(await store.run(automatic.id))!.results.find(r=>r.status==='failed')!.id;assert.ok(!autoCompleted.evidence?.some(e=>e.id===failedId));
   assert.equal((await new ModelBudget(pool).read(automatic.id)).started_calls,13);assert.ok(Number((await pool.query("SELECT count(*) n FROM events WHERE run_id=$1 AND event='progress'",[automatic.id])).rows[0].n)<=3);
   // Exercise the real ChatOpenAI tool binding and HTTP path: configuration
   // cloning must neither lose the meter nor issue a request past the budget.
   const native=await tasks.create({datasetId:meta.id,goal:'真实模型适配器预算测试',mode:'automatic',targetWords:1000,maxModelCalls:10},'adapter-test');
   let requests=0;const serverErrors:string[]=[];
   const nativeCalls=[
    {name:'run_analysis',args:{question:'本次研究数据与问题如何对应？',name:'get_dataset_summary',params:{}}},
    {name:'propose_outline',args:{title:'HTTP适配器研究',outline,brief}},
    {name:'write_chapter',args:{chapterId:'overview',body:prose,findings:'HTTP主流程写入完成',evidenceIds:[]}},
    {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'中断后完成下一章',evidenceIds:[]}},
    {name:'read_report',args:{}},
    {name:'finish_report',args:{review:{revisions:{overview:1,directions:1},summary:'已回读当前两章全文并核对引用、计数与章节结论。'}}},
   ];
   const server=createServer(async(request,response)=>{
    try{
     let raw='';for await(const chunk of request)raw+=chunk;const payload=JSON.parse(raw);assert.equal(payload.stream,false);
     const call=nativeCalls[requests++];assert.ok(call,'unexpected HTTP model request');
     response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({id:'chatcmpl-test-'+requests,object:'chat.completion',created:1,model:'adapter-test',choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'native-call-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
    }catch(error){serverErrors.push(String(error));response.writeHead(500,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{message:String(error)}}));}
   });
   await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{
    const port=(server.address() as {port:number}).port;
    const nativeExecute=()=>withModelSettings({model:'adapter-test',base:'http://127.0.0.1:'+port+'/v1',apiKey:'fixture'},()=>withModelRun(native.id,async()=>executeDeepResearch(pool,(await store.run(native.id))!,new AbortController().signal)));
    await new ModelBudget(pool).set(native.id,3);await assert.rejects(nativeExecute(),/预算上限/);
    assert.equal(requests,3);assert.equal((await tasks.get(native.id))!.status,'paused');assert.equal((await tasks.get(native.id))!.chapters?.length,1);
    await new ModelBudget(pool).set(native.id,10);await tasks.resume(native.id);await nativeExecute();
    assert.equal(requests,6);assert.equal((await tasks.get(native.id))!.status,'completed');assert.equal((await tasks.versions(native.id,'overview')).length,1);
    assert.equal((await new ModelBudget(pool).read(native.id)).started_calls,6);
    assert.equal(Number((await admin.query('SELECT count(*) n FROM model_usage WHERE run_id=$1',[native.id])).rows[0].n),6);assert.deepEqual(serverErrors,[]);
   }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
   // Serialized messages must return as native objects, not plain JSON data.
   const isolated=await tasks.create({datasetId:meta.id,goal:'序列化研究状态',mode:'automatic',targetWords:1000},'test'),saver=new ResearchCheckpointer(pool,isolated.id),checkpoint=emptyCheckpoint();
   checkpoint.channel_values={messages:[new HumanMessage('保存原文')]};const cfg=await saver.put({configurable:{thread_id:isolated.id}},checkpoint,{source:'input',step:0,parents:{}});
   await saver.putWrites(cfg,[['messages',new AIMessage('保留消息类型')]],'writer','1');const restored=await new ResearchCheckpointer(pool,isolated.id).getTuple(cfg);assert.ok((restored!.checkpoint.channel_values.messages as HumanMessage[])[0] instanceof HumanMessage);assert.ok(restored!.pendingWrites![0][2] instanceof AIMessage);
   await tasks.pause(isolated.id);assert.equal((await tasks.get(isolated.id))!.status,'paused');await tasks.resume(isolated.id);assert.equal((await tasks.get(isolated.id))!.status,'queued');
  });
 }finally{if(runtime)await runtime.end();await admin.query(`DROP OWNED BY ${role}`).catch(()=>{});await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();}
});

test('long report assembly keeps chapter bodies, ordering and missing chapters visible as an error',()=>{
 const task={id:'t',title:'长篇研究',outline,input:{datasetId:'d',goal:'研究',mode:'automatic' as const,targetWords:30000,maxModelCalls:120},status:'running' as const,outline_confirmed:true,feedback:[],error:'',report_id:null,updated_at:'',evidence:[],chapters:[{id:'overview',body:'甲'.repeat(16000),findings:'',revision:1,evidence_ids:[],updated_at:''},{id:'directions',body:'乙'.repeat(16000),findings:'',revision:1,evidence_ids:[],updated_at:''}]};
 const body=assembleResearchReport(task);assert.ok(body.length>32000);assert.ok(body.indexOf('甲')<body.indexOf('乙'));assert.throws(()=>assembleResearchReport({...task,chapters:task.chapters.slice(0,1)}),/尚未完成/);
});

test('research writing removes requested disclaimer patterns while retaining substantive negative findings',()=>{
 assert.deepEqual(researchEditorialIssues('## 字段覆盖：状态字段缺失\nlegalStatus 覆盖率为0，因此不涉及法律判断。'),[]);
 assert.deepEqual(researchEditorialIssues('这种形态描述本语料，而非整个行业。'),[]);
 assert.deepEqual(researchEditorialIssues('专利原文声明，非独立实验验证。未检出不等于不存在；在本次范围内可能与年份缺失有关。'),[]);
 assert.ok(researchEditorialIssues('方法与数据限制说明：需要人工复核，仅供参考。').length);
 assert.deepEqual(researchEditorialIssues('2018年公开11件，2019年公开1件。申请人采用名称计数；同一公开件可以计入多个申请人。没有形成单一主体优势。'),[]);
});

 test('research length counts prose rather than source handles, URLs and punctuation',()=>{assert.equal(researchWordCount('中文 analysis 2025 [[source:abc]] [[chart:def]] [来源](https://example.org/long/path) 。'),6);assert.equal(researchWordCount('甲'.repeat(999)+'[[source:'+'id'.repeat(100)+']]'),999);});

 test('research previews bound model context while complete rows remain pageable',()=>{
 const ids=Array.from({length:3000},(_,i)=>'US'+i),rows=Array.from({length:300},(_,i)=>({word:'term'+i,count:i}));
 const result={id:'r',tool:'generate_wordcloud',title:'Terms',status:'completed',datasetId:'d',createdAt:'',params:{},summary:'Terms',method:'tfidf',warnings:[],evidence:[],rows,scope:{inputCount:3000,analyzedCount:3000,counting:'publication',patentIds:ids,entityRules:[]},rowSources:[{row:0,patentIds:ids,representatives:[]}]} as AnalysisResult;
 const preview=researchResultPreview(result) as unknown as {rows:unknown[];scope:{patentIds:string[];patentCount:number};rowSources:{patentIds:string[];omittedPatentIds:number}[];nextOffset:number};assert.equal(preview.rows.length,20);assert.equal(preview.nextOffset,20);assert.equal(preview.scope.patentCount,3000);assert.equal(preview.scope.patentIds.length,20);assert.equal(preview.rowSources[0].omittedPatentIds,2980);
 const page=researchResultPage(result,{offset:250,limit:50});assert.ok('rows' in page);assert.equal(page.rows![0].word,'term250');assert.equal(result.rows.length,300);assert.equal(result.scope!.patentIds.length,3000);
 });

 test('model-based full-text analysis requires a deliberate bounded selection while statistics keep the dataset scope',()=>{
 for(const name of ['analyze_tech_matrix','analyze_patent_reading','analyze_claim_elements','compare_claims'])assert.throws(()=>requireResearchSelection(name,{}),/显式指定/);
 assert.throws(()=>requireResearchSelection('analyze_tech_matrix',{patent_numbers:Array(6).fill('US1')}),/1至5/);assert.throws(()=>requireResearchSelection('compare_claims',{patent_numbers:['US1']}),/至少/);
 assert.doesNotThrow(()=>requireResearchSelection('analyze_tech_matrix',{patent_numbers:['US1']}));assert.throws(()=>requireResearchSelection('analyze_tech_matrix',{patent_numbers:['US2']},[{id:'US1'}]),/不在当前数据集/);assert.doesNotThrow(()=>requireResearchSelection('analyze_patent_trend',{}));assert.ok(researchToolPolicy('analyze_tech_matrix').execution.includes('模型'));
 });

 test('research patent checks ignore UUID reference handles while retaining publication identifiers',()=>{assert.deepEqual(researchPatentMentions('BM25 bm25 CR3 11.8% [[chart:e366303e-406e-4f85-8a8c-4b0d52b59b83]] [[source:80b646d2-bb2f-45af-b8c1-4443f641c9b2]] US9021001B1'),['US9021001B1']);});

 test('delivery keeps actual research gaps open until the same question is resolved',()=>{
 const issue={at:'now',question:'分母是否一致？',finding:'需要核对',evidenceIds:[],gaps:['分母未核对'],nextAction:'读取来源',chapterIds:['overview']};
 const chapter={...issue,question:'章节进展：概述',gaps:[]};
 assert.deepEqual(openResearchQuestions([issue,chapter]),[issue]);
 const scoped={...issue,resolution:{kind:'scoped' as const,reason:'原文未给实测数据，结论已限定为技术机制比较，保留实验验证问题。'}};assert.deepEqual(openResearchQuestions([issue,scoped]),[]);assert.equal(scoped.gaps.length,1);
 assert.deepEqual(openResearchQuestions([issue,chapter,{...issue,finding:'已核对并收窄结论',gaps:[]}]),[]);
 });

 test('full-text analysis preserves enough calls to write unfinished chapters and finish',()=>{
 assert.throws(()=>requireResearchCapacity(48,50,6),/48.*50.*8/);
 assert.doesNotThrow(()=>requireResearchCapacity(10,50,6));
 assert.doesNotThrow(()=>requireResearchCapacity(0,8,6));
 });
